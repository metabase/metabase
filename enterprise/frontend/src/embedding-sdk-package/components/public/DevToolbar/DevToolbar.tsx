/* Dev-only diagnostics overlay shown only to developers building a data app,
   never to end users. It's self-contained (React + inline styles, no `metabase/ui`)
   so it stays lean and renders without a theme provider, but its colors use
   Metabase's `--mb-color-*` variables (with Metabase-default fallbacks, since it
   renders outside the provider) so it matches the app. Labels aren't localized. */
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
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  color: "#ffffff",
  background: hasErrors
    ? "var(--mb-color-error, #e35050)"
    : "var(--mb-color-brand, #509ee3)",
  boxShadow: "0 2px 8px var(--mb-color-shadow, rgba(0, 0, 0, 0.13))",
  fontWeight: 700,
});

const panelStyle: CSSProperties = {
  width: 380,
  maxHeight: "60vh",
  marginBottom: 8,
  display: "flex",
  flexDirection: "column",
  background: "var(--mb-color-background, #ffffff)",
  color: "var(--mb-color-text-primary, #4c5773)",
  border: "1px solid var(--mb-color-border, #eeecec)",
  borderRadius: 8,
  overflow: "hidden",
  boxShadow: "0 8px 24px var(--mb-color-shadow, rgba(0, 0, 0, 0.13))",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  background: "var(--mb-color-background-secondary, #f9fbfc)",
  borderBottom: "1px solid var(--mb-color-border, #eeecec)",
};

const titleStyle: CSSProperties = { fontWeight: 700 };
const spacerStyle: CSSProperties = { flex: 1 };

const linkButtonStyle: CSSProperties = {
  border: "none",
  background: "none",
  color: "var(--mb-color-brand, #509ee3)",
  cursor: "pointer",
  padding: 0,
  fontSize: 13,
  fontWeight: 600,
};

const bodyStyle: CSSProperties = { overflowY: "auto", padding: 4 };

const emptyStyle: CSSProperties = {
  padding: 12,
  color: "var(--mb-color-text-secondary, #696e7b)",
};

const entryStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--mb-color-border, #eeecec)",
};

const entryTimeStyle: CSSProperties = {
  color: "var(--mb-color-text-tertiary, #949aab)",
  fontSize: 11,
  marginBottom: 2,
};

const entryMessageStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "Monaco, ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  color: "var(--mb-color-text-primary, #4c5773)",
};
