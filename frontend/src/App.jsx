
import { useEffect, useState } from "react";
import "./App.css";
import IncidentForm from "./IncidentForm";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadIncidents() {
    try {
      const response = await fetch(`${API_URL}/api/incidents`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load incidents.");
      }

      setIncidents(result.incidents || []);
    } catch (error) {
      console.error("Loading incidents failed:", error);
      alert("Could not connect to the backend. Please check Flask.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIncidents();
  }, []);

  async function saveIncident(data) {
    try {
      const response = await fetch(`${API_URL}/api/incidents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save incident.");
      }

      setIncidents((previous) => [
        result.incident,
        ...previous
      ]);

      setShowNewIncident(false);
      setActiveTab("Overview");

      alert("Your incident has been saved successfully!");

    } catch (error) {
      console.error("Saving incident failed:", error);
      alert(`Incident could not be saved: ${error.message}`);
    }
  }

  function viewIncident(incident) {
    const story =
      incident.transcript ||
      incident.description ||
      "No written story available.";

    const reportSummary = incident.report?.summary
      ? `\n\nAI SUMMARY:\n${incident.report.summary}`
      : "";

    const extracted = incident.evidence_text
      ? `\n\nEXTRACTED DOCUMENT DETAILS:\n${incident.evidence_text}`
      : "";

    const report = incident.report?.draft_report
      ? `\n\nSTRUCTURED REPORT:\n${incident.report.draft_report}`
      : "";

    alert(
      `Incident ID: ${incident.incident_code}\n\n` +
      `Title: ${incident.title}\n` +
      `Category: ${incident.category}\n` +
      `Date: ${incident.created_at}\n` +
      `Language: ${incident.language}\n` +
      `Status: ${incident.status}\n\n` +
      `Incident details:\n${story}` +
      reportSummary +
      report +
      extracted
    );
  }

  const documentedCount = incidents.filter(
    (incident) => incident.status === "Documented"
  ).length;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <span>EchoWitness</span>
        </div>

        <p className="menu-label">WORKSPACE</p>

        {[
          "Overview",
          "My Incidents",
          "Evidence Vault",
          "Reports"
        ].map((item) => (
          <button
            key={item}
            className={`nav-item ${
              activeTab === item ? "active" : ""
            }`}
            onClick={() => {
              setActiveTab(item);
              setShowNewIncident(false);
            }}
          >
            {item}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">U</div>
            <div>
              <strong>My Account</strong>
              <small>Personal workspace</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace /{" "}
            {showNewIncident ? "New Incident" : activeTab}
          </span>

          <div className="topbar-right">
            <span className="language">ENGLISH</span>
            <div className="avatar small-avatar">U</div>
          </div>
        </header>

        <section className="page-content">
          {showNewIncident ? (
            <IncidentForm
              apiUrl={API_URL}
              onBack={() => setShowNewIncident(false)}
              onSave={saveIncident}
            />
          ) : (
            <>
              <div className="welcome-section">
                <div>
                  <p className="eyebrow">
                    YOUR PERSONAL RECORD SPACE
                  </p>

                  <h1>
                    {activeTab === "Overview"
                      ? "Good to see you."
                      : activeTab}
                  </h1>

                  <p className="welcome-description">
                    Keep your experiences, records and supporting
                    evidence organized in one place.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={() => setShowNewIncident(true)}
                >
                  + New incident
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <span>Total incidents</span>
                  <h2>
                    {String(incidents.length).padStart(2, "0")}
                  </h2>
                  <small>Your saved incidents</small>
                </div>

                <div className="stat-card">
                  <span>Evidence files analysed</span>
                  <h2>
                    {String(
                      incidents.filter(
                        (item) => item.evidence_text
                      ).length
                    ).padStart(2, "0")}
                  </h2>
                  <small>
                    Incidents with extracted document text
                  </small>
                </div>

                <div className="stat-card highlight-card">
                  <span>Documented</span>
                  <h2>
                    {String(documentedCount).padStart(2, "0")}
                  </h2>
                  <small>Saved incident records</small>
                </div>
              </div>

              <section className="incidents-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">YOUR RECORDS</p>
                    <h2>
                      {activeTab === "My Incidents"
                        ? "All incidents"
                        : "Recent incidents"}
                    </h2>
                  </div>

                  <button
                    className="text-button"
                    onClick={() => setActiveTab("My Incidents")}
                  >
                    View all →
                  </button>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>INCIDENT</th>
                        <th>CATEGORY</th>
                        <th>DATE CREATED</th>
                        <th>STATUS</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan="5">
                            Loading incidents...
                          </td>
                        </tr>
                      ) : incidents.length === 0 ? (
                        <tr>
                          <td colSpan="5">
                            No incidents saved yet. Click + New
                            incident to create your first record.
                          </td>
                        </tr>
                      ) : (
                        incidents.map((incident) => (
                          <tr key={incident.id}>
                            <td>
                              <strong>{incident.title}</strong>
                              <small className="incident-id">
                                {incident.incident_code}
                              </small>
                            </td>

                            <td>{incident.category}</td>
                            <td>{incident.created_at}</td>

                            <td>
                              <span className="status">
                                {incident.status}
                              </span>
                            </td>

                            <td>
                              <button
                                className="view-button"
                                onClick={() => viewIncident(incident)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bottom-section">
                <div className="bottom-card">
                  <span className="card-number">
                    01 / DOCUMENT
                  </span>
                  <h3>Your records, organized.</h3>
                  <p>
                    Keep your statements, photographs, receipts
                    and documents together.
                  </p>
                </div>

                <div className="bottom-card orange-card">
                  <span className="card-number">
                    02 / UNDERSTAND
                  </span>
                  <h3>Every detail matters.</h3>
                  <p>
                    Build a clear timeline from the information
                    you provide.
                  </p>
                </div>
              </section>

              <footer>
                <span>EchoWitness</span>
                <span>
                  Your story. Your records. Your control.
                </span>
              </footer>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
