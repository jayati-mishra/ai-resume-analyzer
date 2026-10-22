
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();

app.use(cors());
app.use(express.json());

// Store uploaded PDFs in memory instead of saving them to disk
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // Maximum 5 MB
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
    }
});

// Skills recognized by the ATS checker
const skillDictionary = [
    { name: "C++", aliases: ["c++"] },
    { name: "JavaScript", aliases: ["javascript", "js"] },
    { name: "HTML", aliases: ["html"] },
    { name: "CSS", aliases: ["css"] },
    { name: "React", aliases: ["react"] },
    { name: "Node.js", aliases: ["node.js", "nodejs"] },
    { name: "Express", aliases: ["express"] },
    { name: "MongoDB", aliases: ["mongodb"] },
    {
        name: "REST APIs",
        aliases: [
            "rest api",
            "rest apis",
            "restful api",
            "restful apis"
        ]
    },
    { name: "Git", aliases: ["git"] },
    { name: "Python", aliases: ["python"] },
    { name: "SQL", aliases: ["sql"] },
    { name: "Java", aliases: ["java"] },
    { name: "TypeScript", aliases: ["typescript"] },
    { name: "AWS", aliases: ["aws"] },
    { name: "Docker", aliases: ["docker"] }
];

// Match complete skill names rather than partial words
function containsSkill(text, aliases) {
    const normalizedText = text.toLowerCase();

    return aliases.some((alias) => {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
                error: uploadError.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: "Please select a PDF resume."
            });
        }

        let parser;

        try {
            // pdf-parse 2.x API
            const { PDFParse } = await import("pdf-parse");

            parser = new PDFParse({
                data: new Uint8Array(req.file.buffer)
            });

            const result = await parser.getText();
            const extractedText = result.text || "";

            if (!extractedText.trim()) {
                return res.status(400).json({
                    error:
                        "No text found. This PDF may be scanned or image-based. Please use a text-based PDF."
                });
            }

            res.json({
                text: extractedText,
                message: "PDF text extracted successfully."
            });
        } catch (error) {
            console.error("PDF extraction error:", error);

            res.status(500).json({
                error: "Could not read this PDF. Please try another PDF."
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
        const { resume, jobDescription } = req.body;

        if (
            typeof resume !== "string" ||
            typeof jobDescription !== "string" ||
            !resume.trim() ||
            !jobDescription.trim()
        ) {
            return res.status(400).json({
                error: "Resume and job description are required."
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

        // Identify required skills not found in the resume
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
You are a strict resume and job description analyzer.

RESUME TEXT:
"""
${resume}
"""

JOB DESCRIPTION:
"""
${jobDescription}
"""

Rules:
1. Treat the resume and job description as separate documents.
2. Identify only skills required by the job description.
3. Only claim a skill is present when the resume explicitly supports it.
4. Never infer skills from project titles alone.
5. Never invent experience, achievements, or qualifications.
6. Quote exact resume text as evidence for each identified skill.
7. Do not classify a skill as both found and missing.
8. Do not invent additional job requirements.
9. Do not guarantee hiring outcomes.

Return these sections:
1. Skills found in resume
2. Required skills missing or not mentioned
3. Exact evidence from resume
4. Improvement suggestions
5. Learning roadmap
6. Limitations

If evidence is unclear, say "Not explicitly mentioned."
`;

        const response = await fetch(
            "http://localhost:11434/api/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama3.2:1b",
                    prompt,
                    stream: false
                })
            }
        );

        if (!response.ok) {
            throw new Error("Ollama could not generate a response.");
        }

        const aiData = await response.json();

        res.json({
            analysis: aiData.response,
            atsScore,
            matchedSkills: matchedSkills.map((skill) => skill.name),
            missingSkills: missingSkills.map((skill) => skill.name),
            totalRequiredSkills: requiredSkills.length
        });
    } catch (error) {
        console.error("Analysis error:", error);

        res.status(500).json({
            error:
                "Analysis failed. Check whether Ollama is running and the model is available."
        });
    }
});

app.listen(5000, () => {
    console.log("Backend running on http://localhost:5000");
});
