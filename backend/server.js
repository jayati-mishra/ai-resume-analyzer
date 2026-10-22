
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// PDF uploads: store files in memory, maximum 5 MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, callback) => {
        if (
            file.mimetype === "application/pdf" ||
            file.originalname.toLowerCase().endsWith(".pdf")
        ) {
            callback(null, true);
        } else {
            callback(new Error("Please upload a PDF file."));
        }
    },
});

// Skills recognized by the ATS checker
const skillDictionary = [
    { name: "C++", aliases: ["c++"] },
    { name: "JavaScript", aliases: ["javascript", "js"] },
    { name: "HTML", aliases: ["html"] },
    { name: "CSS", aliases: ["css"] },
    { name: "React", aliases: ["react", "react.js", "reactjs"] },
    { name: "Node.js", aliases: ["node.js", "nodejs"] },
    { name: "Express", aliases: ["express.js", "express"] },
    { name: "MongoDB", aliases: ["mongodb"] },
    {
        name: "REST APIs",
        aliases: [
            "rest api",
            "rest apis",
            "restful api",
            "restful apis",
        ],
    },
    { name: "Git", aliases: ["git"] },
    { name: "GitHub", aliases: ["github"] },
    { name: "Python", aliases: ["python"] },
    { name: "SQL", aliases: ["sql"] },
    { name: "Java", aliases: ["java"] },
    { name: "TypeScript", aliases: ["typescript"] },
    { name: "AWS", aliases: ["aws"] },
    { name: "Docker", aliases: ["docker"] },
    {
        name: "Data Structures and Algorithms",
        aliases: [
            "data structures and algorithms",
            "data structures",
            "dsa",
        ],
    },
    {
        name: "Object-Oriented Programming",
        aliases: ["object-oriented programming", "oop", "oops"],
    },
    { name: "Problem-solving", aliases: ["problem-solving", "problem solving"] },
];

// Escape special regular-expression characters
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match complete skill names, not partial words
function containsSkill(text, aliases) {
    const normalizedText = text.toLowerCase();

    return aliases.some((alias) => {
        const escaped = escapeRegex(alias.toLowerCase());

        const pattern = new RegExp(
            `(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`,
            "i"
        );

        return pattern.test(normalizedText);
    });
}

// PDF upload and text extraction endpoint
app.post("/extract-pdf", (req, res) => {
    upload.single("resume")(req, res, async (uploadError) => {
        if (uploadError) {
            return res.status(400).json({
                error: uploadError.message,
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: "Please select a PDF resume.",
            });
        }

        let parser;

        try {
            const { PDFParse } = await import("pdf-parse");

            parser = new PDFParse({
                data: new Uint8Array(req.file.buffer),
            });

            const result = await parser.getText();
            const extractedText = result.text || "";

            if (!extractedText.trim()) {
                return res.status(400).json({
                    error:
                        "No text found. This PDF may be scanned or image-based. Please use a text-based PDF.",
                });
            }

            return res.json({
                text: extractedText,
                message: "PDF text extracted successfully.",
            });
        } catch (error) {
            console.error("PDF extraction error:", error);

            return res.status(500).json({
                error: "Could not read this PDF. Please try another PDF.",
            });
        } finally {
            if (parser) {
                try {
                    await parser.destroy();
                } catch (error) {
                    console.error("PDF cleanup error:", error);
                }
            }
        }
    });
});

// Resume analysis and ATS scoring endpoint
app.post("/analyze", async (req, res) => {
    try {
        const { resume, jobDescription } = req.body || {};

        if (
            typeof resume !== "string" ||
            typeof jobDescription !== "string" ||
            !resume.trim() ||
            !jobDescription.trim()
        ) {
            return res.status(400).json({
                error: "Resume and job description are required.",
            });
        }

        // Identify skills required by the job description
        const requiredSkills = skillDictionary.filter((skill) =>
            containsSkill(jobDescription, skill.aliases)
        );

        // Identify required skills found in the resume
        const matchedSkills = requiredSkills.filter((skill) =>
            containsSkill(resume, skill.aliases)
        );

        // Identify skills missing from the resume
        const missingSkills = requiredSkills.filter(
            (skill) => !containsSkill(resume, skill.aliases)
        );

        const atsScore =
            requiredSkills.length === 0
                ? null
                : Math.round(
                      (matchedSkills.length / requiredSkills.length) * 100
                  );

        const prompt = `
Analyze the following resume against the job description.

RESUME:
"""
${resume}
"""

JOB DESCRIPTION:
"""
${jobDescription}
"""

Follow these rules:
1. Treat the resume and job description as separate documents.
2. Identify only skills required by the job description.
3. Only claim a skill is present when the resume explicitly supports it.
4. Never invent experience, achievements, or qualifications.
5. Quote exact resume text as evidence for identified skills.
6. Do not classify a skill as both found and missing.
7. Do not invent additional job requirements.
8. Do not guarantee hiring outcomes.

Return these sections:
1. Skills found in resume
2. Required skills missing or not mentioned
3. Exact evidence from resume
4. Improvement suggestions
5. Learning roadmap
6. Limitations

If evidence is unclear, say "Not explicitly mentioned."
`;

        // Use the hosted Groq API instead of local Ollama
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error:
                    "AI API key is not configured. Add GROQ_API_KEY to your Render environment variables.",
            });
        }

        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "openai/gpt-oss-120b",
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a careful resume analyzer. Use only the supplied resume and job description. Never invent facts or guarantee hiring outcomes.",
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                    temperature: 0.2,
                }),
            }
        );

        const aiData = await response.json();

        if (!response.ok) {
            console.error("AI provider error:", aiData);

            return res.status(502).json({
                error:
                    aiData.error?.message ||
                    "The AI provider could not generate an analysis. Check your API key, model availability, and usage limits.",
            });
        }

        const analysisText =
            aiData.choices?.[0]?.message?.content;

        if (!analysisText) {
            throw new Error("The AI provider returned an empty response.");
        }

        return res.json({
            analysis: analysisText,
            atsScore,
            matchedSkills: matchedSkills.map((skill) => skill.name),
            missingSkills: missingSkills.map((skill) => skill.name),
            totalRequiredSkills: requiredSkills.length,
        });
    } catch (error) {
        console.error("Analysis error:", error);

        return res.status(500).json({
            error:
                error.message ||
                "Analysis failed. Please check the backend logs.",
        });
    }
});

// Basic health-check endpoint
app.get("/", (req, res) => {
    res.json({
        message: "AI Resume Analyzer backend is running.",
    });
});

// Render provides its own port through process.env.PORT
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
