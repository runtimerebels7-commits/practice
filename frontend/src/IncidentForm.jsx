
import { useEffect, useRef, useState } from "react";
import "./IncidentForm.css";

const languageCodes = {
  English: "en-IN",
  Hindi: "hi-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Kannada: "kn-IN",
  Malayalam: "ml-IN",
  Bengali: "bn-IN",
  Marathi: "mr-IN",
  Gujarati: "gu-IN",
  Punjabi: "pa-IN",
  Odia: "od-IN",
  Assamese: "as-IN",
  Urdu: "ur-IN",
};

const translationLanguages = Object.entries(languageCodes).map(
  ([name, code]) => ({ name, code })
);

const ttsSupportedCodes = new Set([
  "en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN",
  "bn-IN", "gu-IN", "mr-IN", "pa-IN"
]);

function IncidentForm({
  onBack,
  onSave,
  apiUrl =  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000"
}) {
  const [language, setLanguage] = useState("English");
  const [category, setCategory] = useState("Financial");
  const [description, setDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceResult, setEvidenceResult] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("en-IN");
  const [translatedText, setTranslatedText] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [speechUrl, setSpeechUrl] = useState("");
  const [speechLoading, setSpeechLoading] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioUrlRef = useRef("");
  const speechUrlRef = useRef("");

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (speechUrlRef.current) URL.revokeObjectURL(speechUrlRef.current);
    };
  }, []);

  async function startRecording() {
    try {
      setMessage("");
      setTranscript("");
      setReport(null);
      setAudioBlob(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is not supported by this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setMessage("Recording failed. Please try again.");
        setIsRecording(false);
      };

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm"
          });

          if (!blob.size) {
            setMessage("The recording is empty. Please record again.");
          } else {
            const url = URL.createObjectURL(blob);

            if (audioUrlRef.current) {
              URL.revokeObjectURL(audioUrlRef.current);
            }

            audioUrlRef.current = url;
            setAudioBlob(blob);
            setAudioUrl(url);
            setMessage("Recording completed. You can now transcribe it.");
          }
        } catch (error) {
          setMessage("Could not process the recording: " + error.message);
        } finally {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          setIsRecording(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setMessage(error.message || "Microphone access failed.");
      setIsRecording(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;

    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }

  function removeRecording() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = "";
    }

    setAudioUrl("");
    setAudioBlob(null);
    setTranscript("");
    setReport(null);
    setMessage("");
  }

  async function transcribeRecording() {
    if (!audioBlob) {
      setMessage("Please record your story first.");
      return;
    }

    setLoading(true);
    setMessage("Sending your recording to Sarvam Saaras v4...");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("language_code", languageCodes[language]);

      const response = await fetch(`${apiUrl}/api/transcribe`, {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Transcription failed.");
      }

      if (!result.transcript?.trim()) {
        setMessage("Sarvam returned an empty transcription. Please record again and speak clearly.");
        return;
      }

      setTranscript(result.transcript);
      setReport(null);
      setMessage("Transcription completed successfully with Saaras v4.");
    } catch (error) {
      setMessage("Transcription error: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function extractEvidence() {
    if (!evidenceFile) {
      setMessage("Choose a PDF, PNG or JPG document first.");
      return;
    }

    setEvidenceLoading(true);
    setMessage("Sarvam Vision is analysing your document. This may take a little time...");

    try {
      const formData = new FormData();
      formData.append("file", evidenceFile);
      formData.append("language_code", languageCodes[language]);

      const response = await fetch(`${apiUrl}/api/evidence/extract`, {
        method: "POST",
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Document extraction failed.");
      }

      setEvidenceResult(result.extracted);
      setReport(null);
      setMessage("Document analysis completed with Sarvam Vision. Review the extracted details.");
    } catch (error) {
      setMessage("Document extraction error: " + error.message);
    } finally {
      setEvidenceLoading(false);
    }
  }

  function getEvidenceText() {
    if (!evidenceResult) return "";

    return Object.entries(evidenceResult)
      .map(([key, value]) =>
        `${key.replaceAll("_", " ")}: ${
          Array.isArray(value) ? value.join("; ") : value ?? ""
        }`
      )
      .join("\n");
  }

  async function generateReport() {
    if (!description.trim() && !transcript.trim() && !getEvidenceText()) {
      setMessage("Add your story, transcribe a recording, or analyse a supporting document first.");
      return;
    }

    setReportLoading(true);
    setMessage("Sarvam 105B is understanding the incident and preparing your report...");
    setReport(null);
    setTranslatedText("");

    try {
      const response = await fetch(`${apiUrl}/api/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          language,
          description,
          transcript,
          evidence_text: getEvidenceText()
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Report generation failed.");
      }

      setReport(result.report);
      setMessage("Your draft report is ready. Please review every detail before saving.");
    } catch (error) {
      setMessage("Report generation error: " + error.message);
    } finally {
      setReportLoading(false);
    }
  }

  async function translateReport() {
    const textToTranslate =
      report?.draft_report || transcript || description;

    if (!textToTranslate) {
      setMessage("Generate a report or enter text before translating.");
      return;
    }

    if (textToTranslate.length > 2000) {
      setMessage("Sarvam-Translate accepts up to 2,000 characters per request. Shorten the report text and try again.");
      return;
    }

    setTranslationLoading(true);
    setMessage("Translating with Sarvam-Translate...");

    try {
      const response = await fetch(`${apiUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToTranslate,
          source_language_code: languageCodes[language],
          target_language_code: targetLanguage
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Translation failed.");
      }

      setTranslatedText(result.translated_text);
      setMessage("Translation completed. Review it before using or sharing it.");
    } catch (error) {
      setMessage("Translation error: " + error.message);
    } finally {
      setTranslationLoading(false);
    }
  }

  async function readReportAloud() {
    const textToSpeak =
      translatedText || report?.draft_report || transcript || description;

    const speechLanguage = translatedText
      ? targetLanguage
      : languageCodes[language];

    if (!textToSpeak) {
      setMessage("Generate or enter report text before using read aloud.");
      return;
    }

    if (textToSpeak.length > 2500) {
      setMessage("Bulbul v4 Flash supports up to 2,500 characters per request. Shorten the report and try again.");
      return;
    }

    if (!ttsSupportedCodes.has(speechLanguage)) {
      setMessage("Bulbul v4 Flash does not support the selected language. Translate to a supported language first.");
      return;
    }

    setSpeechLoading(true);
    setMessage("Generating speech with Bulbul v4 Flash...");

    try {
      const response = await fetch(`${apiUrl}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSpeak,
          language_code: speechLanguage
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Speech generation failed.");
      }

      const binary = atob(result.audio_base64);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }

      const audioBlobResult = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(audioBlobResult);

      if (speechUrlRef.current) {
        URL.revokeObjectURL(speechUrlRef.current);
      }

      speechUrlRef.current = url;
      setSpeechUrl(url);
      setMessage("Audio generated with Bulbul v4 Flash. Use the player below to listen.");
    } catch (error) {
      setMessage("Text-to-speech error: " + error.message);
    } finally {
      setSpeechLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (isRecording) {
      setMessage("Please stop recording before saving.");
      return;
    }

    const evidenceText = getEvidenceText();

    if (!description.trim() && !transcript.trim() && !evidenceText) {
      setMessage("Please enter your story, transcribe your recording, or extract details from a document before saving.");
      return;
    }

    setMessage("Saving your incident...");

    onSave({
      language,
      category,
      description,
      transcript,
      evidence_text: evidenceText,
      report
    });
  }

  return (
    <section className="incident-form-page">
      <div className="form-heading">
        <div>
          <p className="eyebrow">NEW RECORD / 01</p>
          <h2>Tell us what happened.</h2>
          <p className="form-description">
            Share your experience in your own words.
          </p>
        </div>

        <button className="back-button" type="button" onClick={onBack}>
          ← Back
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-card">
          <label htmlFor="language">Preferred language</label>
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {Object.keys(languageCodes).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <label htmlFor="category">Incident category</label>
          <select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>Financial</option>
            <option>Workplace</option>
            <option>Consumer</option>
            <option>Personal safety</option>
            <option>Accident</option>
            <option>Other</option>
          </select>
        </div>

        <div className="form-card">
          <div className="story-heading">
            <div>
              <label htmlFor="story">Your story</label>
              <p>Describe the incident or record your narration.</p>
            </div>
            <span className="optional-label">VOICE / TEXT</span>
          </div>

          <textarea
            id="story"
            rows="7"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setReport(null);
            }}
            placeholder="Start from the beginning. What happened?"
          />

          <div className="recording-area">
            <div>
              <strong>
                {isRecording ? "Recording in progress..." : "Voice recording"}
              </strong>
              <p>
                {isRecording
                  ? "Speak clearly and stop when finished."
                  : "Use your microphone to narrate your experience."}
              </p>
            </div>

            {!isRecording ? (
              <button
                type="button"
                className="record-button"
                onClick={startRecording}
              >
                ● Record story
              </button>
            ) : (
              <button
                type="button"
                className="stop-button"
                onClick={stopRecording}
              >
                Stop recording
              </button>
            )}
          </div>

          {audioUrl && (
            <div className="audio-preview">
              <p>Recording preview</p>
              <audio controls src={audioUrl} />

              <button
                type="button"
                className="remove-audio"
                onClick={removeRecording}
              >
                Remove recording
              </button>

              <button
                type="button"
                className="transcribe-button"
                onClick={transcribeRecording}
                disabled={loading}
              >
                {loading
                  ? "Transcribing..."
                  : "Transcribe with Sarvam Saaras v4"}
              </button>
            </div>
          )}

          {transcript && (
            <div className="transcript-box">
              <h3>Transcription result</h3>
              <textarea
                rows="5"
                value={transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  setReport(null);
                }}
              />
              <p>
                Review and edit your transcription before generating the report.
              </p>
            </div>
          )}
        </div>

        <div className="form-card feature-card">
          <div className="feature-heading">
            <div>
              <p className="eyebrow">SARVAM VISION</p>
              <h3>Supporting document analysis</h3>
              <p>
                Extract names, dates, amounts, reference numbers and key
                details from a receipt, statement, letter or agreement.
              </p>
            </div>
          </div>

          <label htmlFor="evidence-file">
            Choose supporting document (PDF, PNG, JPG)
          </label>

          <input
            id="evidence-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              setEvidenceFile(event.target.files?.[0] || null);
              setEvidenceResult(null);
              setReport(null);
            }}
          />

          {evidenceFile && (
            <p className="helper-text">
              Selected: {evidenceFile.name}
            </p>
          )}

          <button
            type="button"
            className="secondary-action"
            onClick={extractEvidence}
            disabled={!evidenceFile || evidenceLoading}
          >
            {evidenceLoading
              ? "Analysing document..."
              : "Extract details with Sarvam Vision"}
          </button>

          {evidenceResult && (
            <div className="extraction-result">
              <h4>Extracted information — review before use</h4>
              <pre>{JSON.stringify(evidenceResult, null, 2)}</pre>
            </div>
          )}

          <p className="helper-text">
            The extracted text is saved with this incident. The original
            uploaded file is processed for extraction but is not stored
            by this prototype.
          </p>
        </div>

        <div className="form-card feature-card">
          <p className="eyebrow">SARVAM 105B</p>
          <h3>Understand and structure your incident</h3>
          <p>
            Generate a neutral draft, event timeline and questions
            about details that may be missing.
          </p>

          <button
            type="button"
            className="secondary-action"
            onClick={generateReport}
            disabled={reportLoading}
          >
            {reportLoading ? "Generating report..." : "Generate incident report"}
          </button>

          {report && (
            <div className="report-result">
              <h4>AI-generated draft — please verify</h4>
              <p><strong>Summary:</strong> {report.summary || "Not provided"}</p>
              <p><strong>Date:</strong> {report.incident_date || "Not specified"}</p>
              <p><strong>Time:</strong> {report.incident_time || "Not specified"}</p>
              <p><strong>Location:</strong> {report.location || "Not specified"}</p>
              <p>
                <strong>People involved:</strong>{" "}
                {(report.people_involved || []).join(", ") || "Not specified"}
              </p>

              <h4>Event timeline</h4>
              {(report.events || []).length ? (
                <ol>
                  {report.events.map((event, index) => (
                    <li key={`${event.event}-${index}`}>
                      {[event.date, event.time].filter(Boolean).join(" ")}
                      {" — "}
                      {typeof event === "string" ? event : event.event}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No dated events identified.</p>
              )}

              <h4>Missing information / follow-up questions</h4>
              {(report.follow_up_questions || []).length ? (
                <ul>
                  {report.follow_up_questions.map((question, index) => (
                    <li key={index}>{question}</li>
                  ))}
                </ul>
              ) : (
                <p>No follow-up questions generated.</p>
              )}

              <h4>Draft report</h4>
              <div className="draft-report">{report.draft_report}</div>

              <p className="helper-text">
                This is an AI-organized draft based only on the information
                you supplied. It does not verify allegations or establish guilt.
              </p>
            </div>
          )}
        </div>

        <div className="form-card feature-card">
          <p className="eyebrow">SARVAM-TRANSLATE</p>
          <h3>Translate your report</h3>
          <p>
            Translate up to 2,000 characters at a time into another
            supported Indian language.
          </p>

          <label htmlFor="target-language">Translate into</label>
          <select
            id="target-language"
            value={targetLanguage}
            onChange={(event) => {
              setTargetLanguage(event.target.value);
              setTranslatedText("");
            }}
          >
            {translationLanguages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="secondary-action"
            onClick={translateReport}
            disabled={translationLoading}
          >
            {translationLoading ? "Translating..." : "Translate report"}
          </button>

          {translatedText && (
            <div className="translated-result">
              <h4>Translated text</h4>
              <p>{translatedText}</p>
            </div>
          )}
        </div>

        <div className="form-card feature-card">
          <p className="eyebrow">BULBUL V4 FLASH</p>
          <h3>Listen to your report</h3>
          <p>
            Read the translated text aloud when available, otherwise
            read the original report.
          </p>

          <button
            type="button"
            className="secondary-action"
            onClick={readReportAloud}
            disabled={speechLoading}
          >
            {speechLoading ? "Generating audio..." : "Read report aloud"}
          </button>

          {speechUrl && (
            <audio className="generated-audio" controls src={speechUrl} />
          )}

          <p className="helper-text">
            Bulbul v4 Flash supports selected languages. If your language
            is not supported, translate the report to a supported language first.
          </p>
        </div>

        {message && (
          <p className="form-message" role="status">{message}</p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            Cancel
          </button>

          <button type="submit" className="primary-button">
            Save Incident
          </button>
        </div>
      </form>
    </section>
  );
}

export default IncidentForm;
