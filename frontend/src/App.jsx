
import { useState } from "react";
import "./App.css";

function App() {
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [atsResult, setAtsResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  async function handlePdfUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadMessage("");
    setAnalysis("");
    setAtsResult(null);

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadMessage("Please select a PDF file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadMessage("PDF must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("resume", file);

    setUploading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/extract-pdf",
        {
          method: "POST",
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "PDF upload failed.");
      }

      setResume(data.text);
      setUploadMessage(
        `Successfully extracted text from ${file.name}`
      );
    } catch (error) {
      setUploadMessage("Error: " + error.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function analyzeResume() {
    if (!resume.trim() || !jobDescription.trim()) {
      alert("Please enter your resume and job description.");
      return;
    }

    setLoading(true);
    setAnalysis("");
    setAtsResult(null);

    try {
      const response = await fetch(
        "http://localhost:5000/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            resume,
            jobDescription
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      setAtsResult({
        score: data.atsScore,
        matched: data.matchedSkills || [],
        missing: data.missingSkills || [],
        total: data.totalRequiredSkills ?? 0
      });

      setAnalysis(data.analysis || "No analysis returned.");
    } catch (error) {
      setAnalysis("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>AI Resume Analyzer</h1>
      <p>Discover how your resume matches your target job.</p>

      <section className="upload-section">
        <label htmlFor="resume-pdf">Upload Resume (PDF)</label>

        <input
          id="resume-pdf"
          type="file"
          accept=".pdf,application/pdf"
          onChange={handlePdfUpload}
          disabled={uploading || loading}
        />

        <p className="upload-hint">
          Maximum file size: 5 MB. Text-based PDFs are supported.
        </p>

        {uploading && <p>Extracting text from your PDF...</p>}

        {uploadMessage && (
          <p role="status" className="upload-message">
            {uploadMessage}
          </p>
        )}
      </section>

      <label htmlFor="resume-text">Resume Text</label>
      <textarea
        id="resume-text"
        rows="9"
        value={resume}
        onChange={(e) => setResume(e.target.value)}
        placeholder="Upload a PDF or paste your resume here..."
      />

      <label htmlFor="job-description">Job Description</label>
      <textarea
        id="job-description"
        rows="9"
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        placeholder="Paste the requirements for your target job..."
      />

      <button
        onClick={analyzeResume}
        disabled={loading || uploading}
      >
        {loading ? "Analyzing..." : "Analyze My Resume"}
      </button>

      {atsResult && (
        <section className="ats-card">
          <h2>ATS Match Score</h2>

          {atsResult.score == null ? (
            <p>
              No recognized skills were found in the job description.
            </p>
          ) : (
            <>
              <div className="score-number">
                {atsResult.score}%
              </div>

              <div
                className="score-track"
                role="progressbar"
                aria-valuenow={atsResult.score}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="ATS keyword match score"
              >
                <div
                  className="score-fill"
                  style={{ width: `${atsResult.score}%` }}
                />
              </div>

              <p>
                Matched <strong>{atsResult.matched.length}</strong>{" "}
                out of <strong>{atsResult.total}</strong>{" "}
                recognized required skills.
              </p>

              <h3>Matched Skills</h3>
              <p>
                {atsResult.matched.join(", ") || "None"}
              </p>

              <h3>Missing Skills</h3>
              <p>
                {atsResult.missing.join(", ") || "None"}
              </p>

              <small>
                This is an estimated keyword-match score, not an
                official ATS rating or a prediction of hiring success.
              </small>
            </>
          )}
        </section>
      )}

      {analysis && (
        <section className="results">
          <h2>Your Analysis</h2>
          <pre>{analysis}</pre>
        </section>
      )}
    </main>
  );
}

export default App;
