# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
EchoWitness — Sarvam AI feature upgrade
This is a source-code update based on the project ZIP you supplied. It keeps the existing React/Vite dashboard, Flask API, SQLite incident records, incident form and Saaras v4 recording/transcription flow, and adds four Sarvam workflows.
Added integrations
1. Saaras v4 — existing voice transcription.
2. Sarvam 105B — creates a neutral structured incident report and follow-up questions.
3. Sarvam-Translate v1 — translates text/report excerpts (maximum 2,000 characters per request).
4. Bulbul v4 Flash — reads text aloud (maximum 2,500 characters; supported languages only).
5. Sarvam Vision / Document AI — extracts structured fields from PDF, PNG and JPG documents.
Important project layout
The ZIP you supplied has app.py in the project root and the React files in src/. This update preserves that layout. It does not move files into backend/ or frontend/.
Setup
1. Extract this project folder.
2. Create a Python virtual environment in the project root:
   - Windows PowerShell: python -m venv venv
   - Activate: .\venv\Scripts\Activate.ps1
3. Install backend packages:
   - pip install -r requirements.txt
4. Create a file named .env beside app.py and add:
   - SARVAM_API_KEY=your_real_key_here
   - Never put the key in React code or upload .env to GitHub.
5. Start Flask from the project root:
   - python app.py
6. In a second terminal, from the project root, start the frontend:
   - npm install (only if node_modules is not already present)
   - npm run dev
7. Open the Vite URL shown in the terminal, normally http://localhost:5173.
Existing SQLite database
The uploaded ZIP included echowitness.db. It is intentionally not copied into this upgrade ZIP because it may contain personal incident records. Keep your existing database file in the project root beside app.py. The updated backend adds report_json and evidence_text columns automatically and preserves existing incident rows.
Optional frontend API URL
By default, the frontend calls http://127.0.0.1:5000. If needed, create .env.local in the project root (same folder as package.json) and set:

VITE_API_URL=http://127.0.0.1:5000

Restart Vite after changing it.
Feature flow
- Record audio → Transcribe with Saaras v4.
- Add typed/transcribed text and/or extract a supporting document → Generate a report with Sarvam 105B.
- Translate the report excerpt with Sarvam-Translate.
- Read the report aloud with Bulbul v4 Flash.
- Save the incident; the database stores the typed description, transcript, structured report JSON and extracted document text.
Document and evidence limitation
The selected PDF/image is sent to Sarvam Vision for extraction. This prototype saves the extracted text/fields with the incident, but does not retain the original uploaded file. Add secure file storage and access controls before using this for real sensitive evidence.
Safety and review
AI-generated reports are drafts. EchoWitness organizes user-provided statements; it does not verify allegations, determine truth or establish guilt. Users must review AI-extracted names, dates and amounts before saving or sharing.
API endpoints added
- POST /api/generate-report
- POST /api/translate
- POST /api/speak
- POST /api/evidence/extract
Existing routes retained:
- GET /api/health
- GET /api/incidents
- POST /api/incidents
- GET /api/incidents/<id>
- POST /api/transcribe
Sarvam API methods follow the official Sarvam Model API documentation. Availability, account credits, model access and rate limits are controlled by Sarvam.