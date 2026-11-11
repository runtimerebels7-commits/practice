
import os
import re
import json
import time
import sqlite3
import tempfile

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from sarvamai import SarvamAI

# -------------------------------------------------
# CONFIGURATION
# -------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "echowitness.db")

load_dotenv(os.path.join(BASE_DIR, ".env"))

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

app = Flask(__name__)
CORS(app)

app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

TTS_LANGUAGES = {
    "en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN",
    "bn-IN", "gu-IN", "mr-IN", "pa-IN"
}

ALLOWED_DOCUMENT_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
}

TERMINAL_DOC_STATES = {
    "completed", "partially_completed", "failed", "rejected"
}


def get_sarvam_client():
    if not SARVAM_API_KEY:
        raise RuntimeError(
            "Sarvam API key is missing. Add SARVAM_API_KEY to backend/.env."
        )

    return SarvamAI(api_subscription_key=SARVAM_API_KEY)


def get_text(value):
    if value is None:
        return ""
    return str(value).strip()


def sarvam_error(error):
    print("Sarvam API error:", repr(error))

    return jsonify({
        "success": False,
        "error": str(error)
    }), 502


# -------------------------------------------------
# DATABASE
# -------------------------------------------------

def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = get_db_connection()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_code TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            language TEXT NOT NULL,
            description TEXT,
            transcript TEXT,
            status TEXT NOT NULL DEFAULT 'Documented',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    existing_columns = {
        row["name"]
        for row in connection.execute(
            "PRAGMA table_info(incidents)"
        ).fetchall()
    }

    if "report_json" not in existing_columns:
        connection.execute(
            "ALTER TABLE incidents ADD COLUMN report_json TEXT"
        )

    if "evidence_text" not in existing_columns:
        connection.execute(
            "ALTER TABLE incidents ADD COLUMN evidence_text TEXT"
        )

    connection.commit()
    connection.close()


initialize_database()


def incident_to_dict(row):
    result = dict(row)

    if result.get("report_json"):
        try:
            result["report"] = json.loads(result["report_json"])
        except (TypeError, json.JSONDecodeError):
            result["report"] = None
    else:
        result["report"] = None

    result.pop("report_json", None)

    return result


# -------------------------------------------------
# HOME AND HEALTH
# -------------------------------------------------

@app.get("/")
def home():
    return jsonify({
        "message": "Welcome to EchoWitness!",
        "status": "Backend is running successfully"
    })


@app.get("/api/health")
def health():
    return jsonify({
        "project": "EchoWitness",
        "status": "healthy",
        "database": "connected",
        "sarvam_configured": bool(SARVAM_API_KEY)
    })


# -------------------------------------------------
# INCIDENT CREATION
# -------------------------------------------------

@app.post("/api/incidents")
def create_incident():

    data = request.get_json(silent=True) or {}

    category = get_text(data.get("category"))
    language = get_text(data.get("language"))
    description = get_text(data.get("description"))
    transcript = get_text(data.get("transcript"))
    evidence_text = get_text(data.get("evidence_text"))

    report = data.get("report")

    if not category or not language:
        return jsonify({
            "success": False,
            "error": "Category and language are required."
        }), 400

    if not description and not transcript and not evidence_text:
        return jsonify({
            "success": False,
            "error": "Please provide an incident description, transcription, or document details."
        }), 400

    title = get_text(data.get("title")) or f"{category} incident"

    report_json = (
        json.dumps(report, ensure_ascii=False)
        if isinstance(report, dict)
        else None
    )

    connection = get_db_connection()

    try:
        cursor = connection.execute("""
            INSERT INTO incidents (
                incident_code,
                title,
                category,
                language,
                description,
                transcript,
                status,
                report_json,
                evidence_text
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "EW-" + os.urandom(4).hex().upper(),
            title,
            category,
            language,
            description,
            transcript,
            "Documented",
            report_json,
            evidence_text
        ))

        connection.commit()

        row = connection.execute(
            "SELECT * FROM incidents WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

        return jsonify({
            "success": True,
            "message": "Incident saved successfully.",
            "incident": incident_to_dict(row)
        }), 201

    except sqlite3.Error as error:
        connection.rollback()
        print("Database error:", repr(error))

        return jsonify({
            "success": False,
            "error": "Could not save the incident."
        }), 500

    finally:
        connection.close()


# -------------------------------------------------
# GET ALL INCIDENTS
# -------------------------------------------------

@app.get("/api/incidents")
def get_incidents():

    connection = get_db_connection()

    try:
        rows = connection.execute(
            "SELECT * FROM incidents ORDER BY id DESC"
        ).fetchall()

        return jsonify({
            "success": True,
            "incidents": [
                incident_to_dict(row) for row in rows
            ]
        })

    finally:
        connection.close()


# -------------------------------------------------
# GET SINGLE INCIDENT
# -------------------------------------------------

@app.get("/api/incidents/<int:incident_id>")
def get_single_incident(incident_id):

    connection = get_db_connection()

    try:
        row = connection.execute(
            "SELECT * FROM incidents WHERE id = ?",
            (incident_id,)
        ).fetchone()

        if row is None:
            return jsonify({
                "success": False,
                "error": "Incident not found."
            }), 404

        return jsonify({
            "success": True,
            "incident": incident_to_dict(row)
        })

    finally:
        connection.close()


# -------------------------------------------------
# 1. SAARAS V4 - SPEECH TO TEXT
# -------------------------------------------------

@app.post("/api/transcribe")
def transcribe_audio():

    if "audio" not in request.files:
        return jsonify({
            "success": False,
            "error": "No audio file was received."
        }), 400

    audio = request.files["audio"]

    if not audio.filename:
        return jsonify({
            "success": False,
            "error": "Please provide an audio file."
        }), 400

    language_code = request.form.get(
        "language_code", "unknown"
    )

    temporary_path = None

    try:
        suffix = os.path.splitext(audio.filename)[1] or ".webm"

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temporary_file:
            audio.save(temporary_file)
            temporary_path = temporary_file.name

        client = get_sarvam_client()

        with open(temporary_path, "rb") as audio_file:

            response = client.speech_to_text.transcribe(
                file=audio_file,
                model="saaras:v4",
                mode="transcribe",
                language_code=language_code
            )

        return jsonify({
            "success": True,
            "transcript": response.transcript,
            "language_code": response.language_code,
            "request_id": response.request_id,
            "model": "saaras:v4"
        })

    except Exception as error:
        return sarvam_error(error)

    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.remove(temporary_path)


# -------------------------------------------------
# 2. SARVAM 105B - INCIDENT REPORT GENERATION
# -------------------------------------------------

@app.post("/api/generate-report")
def generate_report():

    data = request.get_json(silent=True) or {}

    category = get_text(data.get("category"))
    language = get_text(data.get("language"))
    description = get_text(data.get("description"))
    transcript = get_text(data.get("transcript"))
    evidence_text = get_text(data.get("evidence_text"))

    source_text = "\n\n".join(part for part in [
        "User typed description:\n" + description if description else "",
        "Speech transcript:\n" + transcript if transcript else "",
        "Supporting document text:\n" + evidence_text if evidence_text else ""
    ] if part)

    if not source_text:
        return jsonify({
            "success": False,
            "error": "Add a description, transcript, or document first."
        }), 400

    if len(source_text) > 24000:
        source_text = source_text[:24000]

    system_prompt = """
You are an assistant for EchoWitness, an incident documentation tool.

Organize only the information supplied by the user.

Do not decide whether allegations are true.
Do not identify guilt.
Never invent names, dates, locations, amounts, motives, or events.

Use null or an empty array when information is missing.

Clearly distinguish user statements from information read
from supporting documents.

Return ONLY valid JSON with these keys:

{
 "summary": "short neutral summary",
 "incident_date": "date or null",
 "incident_time": "time or null",
 "location": "location or null",
 "people_involved": [],
 "events": [],
 "amounts_or_losses": [],
 "missing_information": [],
 "follow_up_questions": [],
 "draft_report": "neutral narrative report"
}

Do not add markdown fences or commentary.
"""

    user_prompt = (
        f"Incident category: {category or 'Not specified'}\n"
        f"User language: {language or 'Not specified'}\n\n"
        f"Information supplied:\n{source_text}"
    )

    try:
        client = get_sarvam_client()

        response = client.chat.completions(
            model="sarvam-105b",
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            temperature=0.2,
            max_tokens=1800
        )

        content = response.choices[0].message.content

        content = re.sub(
            r"^```(?:json)?\s*|\s*```$",
            "",
            content.strip(),
            flags=re.IGNORECASE
        )

        report = json.loads(content)

        return jsonify({
            "success": True,
            "report": report,
            "request_id": getattr(response, "request_id", None),
            "model": "sarvam-105b"
        })

    except json.JSONDecodeError:
        return jsonify({
            "success": False,
            "error": "AI response could not be formatted as a report. Please try again."
        }), 502

    except Exception as error:
        return sarvam_error(error)


# -------------------------------------------------
# 3. SARVAM TRANSLATE
# -------------------------------------------------

@app.post("/api/translate")
def translate_text():

    data = request.get_json(silent=True) or {}

    input_text = get_text(data.get("text"))
    source_language_code = get_text(
        data.get("source_language_code")
    )
    target_language_code = get_text(
        data.get("target_language_code")
    )

    if not input_text:
        return jsonify({
            "success": False,
            "error": "There is no text to translate."
        }), 400

    if len(input_text) > 2000:
        return jsonify({
            "success": False,
            "error": "Translation is limited to 2,000 characters."
        }), 400

    if not source_language_code or not target_language_code:
        return jsonify({
            "success": False,
            "error": "Choose both source and target languages."
        }), 400

    if source_language_code == target_language_code:
        return jsonify({
            "success": True,
            "translated_text": input_text,
            "model": "sarvam-translate:v1"
        })

    try:
        client = get_sarvam_client()

        response = client.text.translate(
            input=input_text,
            source_language_code=source_language_code,
            target_language_code=target_language_code,
            model="sarvam-translate:v1",
            mode="formal"
        )

        return jsonify({
            "success": True,
            "translated_text": response.translated_text,
            "source_language_code": response.source_language_code,
            "request_id": response.request_id,
            "model": "sarvam-translate:v1"
        })

    except Exception as error:
        return sarvam_error(error)


# -------------------------------------------------
# 4. BULBUL V4 FLASH - TEXT TO SPEECH
# -------------------------------------------------

@app.post("/api/speak")
def speak_text():

    data = request.get_json(silent=True) or {}

    text = get_text(data.get("text"))
    language_code = get_text(data.get("language_code"))

    if not text:
        return jsonify({
            "success": False,
            "error": "There is no report text to read aloud."
        }), 400

    if len(text) > 2500:
        return jsonify({
            "success": False,
            "error": "Read-aloud is limited to 2,500 characters."
        }), 400

    if language_code not in TTS_LANGUAGES:
        return jsonify({
            "success": False,
            "error": "Choose English, Hindi, Tamil, Telugu, Kannada, Bengali, Gujarati, Marathi, or Punjabi."
        }), 400

    try:
        client = get_sarvam_client()

        response = client.text_to_speech.convert(
            text=text,
            language_code=language_code,
            model="bulbul:v4-flash",
            output_audio_codec="wav"
        )

        return jsonify({
            "success": True,
            "audio_base64": response.audios[0],
            "request_id": response.request_id,
            "model": "bulbul:v4-flash"
        })

    except Exception as error:
        return sarvam_error(error)


# -------------------------------------------------
# 5. SARVAM VISION - DOCUMENT EXTRACTION
# -------------------------------------------------

@app.post("/api/evidence/extract")
def extract_evidence():

    if "file" not in request.files:
        return jsonify({
            "success": False,
            "error": "Choose a PDF or image to analyse."
        }), 400

    uploaded = request.files["file"]

    if not uploaded.filename:
        return jsonify({
            "success": False,
            "error": "The selected file has no filename."
        }), 400

    extension = os.path.splitext(
        uploaded.filename
    )[1].lower()

    mime_type = ALLOWED_DOCUMENT_TYPES.get(extension)

    if not mime_type:
        return jsonify({
            "success": False,
            "error": "Supported formats: PDF, PNG and JPG/JPEG."
        }), 400

    language_code = request.form.get(
        "language_code", "en-IN"
    )

    schema = {
        "type": "object",
        "properties": {
            "document_type": {
                "type": "string"
            },
            "document_date": {
                "type": "string"
            },
            "person_or_organization_names": {
                "type": "array",
                "items": {"type": "string"}
            },
            "amounts_and_currency": {
                "type": "array",
                "items": {"type": "string"}
            },
            "reference_numbers": {
                "type": "array",
                "items": {"type": "string"}
            },
            "key_details": {
                "type": "array",
                "items": {"type": "string"}
            },
            "full_text": {
                "type": "string"
            }
        }
    }

    try:
        client = get_sarvam_client()

        filename = os.path.basename(uploaded.filename)

        job = client.doc_ai.extract(
            file=[(
                filename,
                uploaded.stream,
                mime_type
            )],
            schema=json.dumps(schema, ensure_ascii=False),
            language=language_code,
            output_format="json"
        )

        deadline = time.time() + 150
        status = None

        while time.time() < deadline:

            status = client.doc_ai.get_status(
                job_id=job.job_id
            )

            state = str(status.status).lower()

            if state in TERMINAL_DOC_STATES:
                break

            time.sleep(4)

        if status is None or str(status.status).lower() not in (
            "completed", "partially_completed"
        ):
            state = str(
                getattr(status, "status", "timeout")
            )

            return jsonify({
                "success": False,
                "error": (
                    "Document processing did not complete. "
                    f"Status: {state}"
                ),
                "job_id": job.job_id
            }), 502

        results = client.doc_ai.get_results(
            job_id=job.job_id
        )

        extracted = results.result

        if not isinstance(extracted, dict):
            extracted = {
                "full_text": str(extracted)
            }

        return jsonify({
            "success": True,
            "extracted": extracted,
            "job_id": job.job_id,
            "model": "Sarvam Vision / Document AI"
        })

    except Exception as error:
        return sarvam_error(error)


# -------------------------------------------------
# FILE SIZE ERROR
# -------------------------------------------------

@app.errorhandler(413)
def file_too_large(error):

    return jsonify({
        "success": False,
        "error": "Maximum upload size is 25 MB."
    }), 413


# -------------------------------------------------
# RUN SERVER
# -------------------------------------------------

if __name__ == "__main__":
    app.run(
        debug=True,
        port=5000
    )
