import cx from "classnames";

import type { DataAppDiagnosticPayload } from "../../../types/diagnostics-channel";
import S from "../DevToolbar.module.css";
import { isFailedCall } from "../entries";

interface Props {
  entries: readonly DataAppDiagnosticPayload[];
  emptyMessage: string;
}

export const EntryList = ({ entries, emptyMessage }: Props) => {
  if (entries.length === 0) {
    return <div className={S.Empty}>{emptyMessage}</div>;
  }

  const displayedEntries = entries.slice().reverse();

  return (
    <>
      {displayedEntries.map((entry) => (
        <div
          key={entry.eventId}
          className={cx(S.Entry, { [S.EntryFailed]: isFailedCall(entry) })}
        >
          <div className={S.EntryTime}>
            {new Date(entry.time).toLocaleTimeString()}
          </div>

          {entry.detail ? (
            <details>
              <summary className={cx(S.EntryMessage, S.EntrySummary)}>
                {entry.summary}
              </summary>
              <div className={S.EntryDetail}>{entry.detail}</div>
            </details>
          ) : (
            <div className={S.EntryMessage}>{entry.summary}</div>
          )}

          {entry.hint && <div className={S.EntryHint}>{entry.hint}</div>}
        </div>
      ))}
    </>
  );
};
