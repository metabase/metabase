/* eslint-disable i18next/no-literal-string */
/* eslint-disable metabase/no-literal-metabase-strings -- dev-only toolbar for data-app authors, not whitelabel-able product UI */
import { useState } from "react";

import type { DataAppDiagnosticPayload } from "../../../types/diagnostics-channel";
import S from "../DevToolbar.module.css";
import { EntryList } from "../EntryList/EntryList";
import { isFailedCall } from "../entries";

type Props = {
  entries: readonly DataAppDiagnosticPayload[];
};

export const QueriesTab = ({ entries }: Props) => {
  const [failedOnly, setFailedOnly] = useState(false);
  const failedCount = entries.filter(isFailedCall).length;
  const shown = failedOnly ? entries.filter(isFailedCall) : entries;

  return (
    <>
      <div className={S.Note}>
        Dev runs with an API key; in production the app runs as the viewing
        user, whose data permissions may differ.
      </div>
      <label className={S.Filter}>
        <input
          type="checkbox"
          checked={failedOnly}
          onChange={(event) => setFailedOnly(event.target.checked)}
        />
        Failed only{failedCount > 0 ? ` (${failedCount})` : ""}
      </label>
      <EntryList
        entries={shown}
        emptyMessage={
          failedOnly ? "No failed calls." : "No Metabase calls captured."
        }
      />
    </>
  );
};
