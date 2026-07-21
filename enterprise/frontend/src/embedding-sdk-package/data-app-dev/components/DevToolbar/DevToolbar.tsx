/* eslint-disable i18next/no-literal-string */
import cx from "classnames";
import { useState, useSyncExternalStore } from "react";

import S from "./DevToolbar.module.css";
import {
  clearDevDiagnostics,
  getDevDiagnostics,
  subscribeDevDiagnostics,
} from "./diagnostics";

export function DevToolbar() {
  const entries = useSyncExternalStore(
    subscribeDevDiagnostics,
    getDevDiagnostics,
  );
  const [open, setOpen] = useState(false);
  const count = entries.length;

  return (
    <div className={S.DevToolbar}>
      {open && (
        <div className={S.Panel}>
          <div className={S.Header}>
            <span className={S.Title}>Data app diagnostics</span>
            <span className={S.Spacer} />
            <button
              type="button"
              className={S.Action}
              onClick={clearDevDiagnostics}
            >
              Clear
            </button>
            <button
              type="button"
              className={S.Action}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className={S.Body}>
            {count === 0 ? (
              <div className={S.Empty}>No errors captured.</div>
            ) : (
              entries
                .slice()
                .reverse()
                .map((entry) => (
                  <div key={entry.id} className={S.Entry}>
                    <div className={S.EntryTime}>
                      {new Date(entry.time).toLocaleTimeString()}
                    </div>
                    <div className={S.EntryMessage}>{entry.message}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={cx(S.Toggle, { [S.ToggleHasErrors]: count > 0 })}
        onClick={() => setOpen((value) => !value)}
        title="Data app diagnostics"
      >
        ⚠ Diagnostics{count > 0 ? ` (${count})` : ""}
      </button>
    </div>
  );
}
