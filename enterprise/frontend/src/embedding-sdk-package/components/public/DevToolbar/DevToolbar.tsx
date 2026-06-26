/* Dev-only diagnostics overlay shown only to developers building a data app,
   never to end users. It's deliberately self-contained (React + inline styles,
   no `metabase/ui`) so it stays lean and renders without a theme provider — so
   its labels aren't localized and its colors are inline literals on purpose. */
/* eslint-disable i18next/no-literal-string */
/* eslint-disable metabase/no-color-literals */
import { type CSSProperties, useState, useSyncExternalStore } from "react";

import {
  clearDevDiagnostics,
  getDevDiagnostics,
  subscribeDevDiagnostics,
} from "./diagnostics";

// A dev-only overlay for data apps: a corner button that opens a diagnostics
// panel listing captured errors (including the sandbox's blocked-API logs). It's
// self-contained (React + inline styles), so it needs no theme provider and adds
// no UI-library dependency. Render it in the dev harness (and, later, the host)
// after calling `installDevDiagnostics()`. Later this panel can also list the
// sandbox's blocked-API rules from the distortion callback.

const MAX_Z = 2147483647;

export function DevToolbar() {
  const entries = useSyncExternalStore(
    subscribeDevDiagnostics,
    getDevDiagnostics,
  );
  const [open, setOpen] = useState(false);
  const count = entries.length;

  return (
    <div style={rootStyle}>
      {open && (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <span style={titleStyle}>Data app diagnostics</span>
            <span style={spacerStyle} />
            <button
              type="button"
              style={linkButtonStyle}
              onClick={clearDevDiagnostics}
            >
              Clear
            </button>
            <button
              type="button"
              style={linkButtonStyle}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div style={bodyStyle}>
            {count === 0 ? (
              <div style={emptyStyle}>No errors captured.</div>
            ) : (
              entries
                .slice()
                .reverse()
                .map((entry) => (
                  <div key={entry.id} style={entryStyle}>
                    <div style={entryTimeStyle}>
                      {new Date(entry.time).toLocaleTimeString()}
                    </div>
                    <div style={entryMessageStyle}>{entry.message}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        style={fabStyle(count > 0)}
        onClick={() => setOpen((value) => !value)}
        title="Data app diagnostics"
      >
        ⚠ Diagnostics{count > 0 ? ` (${count})` : ""}
      </button>
    </div>
  );
}

const rootStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: MAX_Z,
  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
  fontSize: 13,
};

const fabStyle = (hasErrors: boolean): CSSProperties => ({
  display: "block",
  marginLeft: "auto",
  padding: "8px 12px",
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  color: "white",
  background: hasErrors ? "#c8312b" : "#3b3f44",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
  fontWeight: 600,
});

const panelStyle: CSSProperties = {
  width: 380,
  maxHeight: "60vh",
  marginBottom: 8,
  display: "flex",
  flexDirection: "column",
  background: "#1f2225",
  color: "#e8eaed",
  borderRadius: 8,
  overflow: "hidden",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "#2b2f33",
  borderBottom: "1px solid #3a3f44",
};

const titleStyle: CSSProperties = { fontWeight: 600 };
const spacerStyle: CSSProperties = { flex: 1 };

const linkButtonStyle: CSSProperties = {
  border: "none",
  background: "none",
  color: "#9bb4ff",
  cursor: "pointer",
  padding: 0,
  fontSize: 13,
};

const bodyStyle: CSSProperties = { overflowY: "auto", padding: 4 };

const emptyStyle: CSSProperties = { padding: 12, color: "#9aa0a6" };

const entryStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #2b2f33",
};

const entryTimeStyle: CSSProperties = {
  color: "#9aa0a6",
  fontSize: 11,
  marginBottom: 2,
};

const entryMessageStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};
