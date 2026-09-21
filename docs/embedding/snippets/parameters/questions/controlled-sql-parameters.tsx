import {
  InteractiveQuestion,
  type SqlParameterChangePayload,
  type SqlParameterValues,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

const questionId = 1;

const ExampleControlled = () => {
  // [<snippet example-controlled>]
  const [sqlParameters, setSqlParameters] = useState<SqlParameterValues>({
    state: "NY",
  });

  const handleSqlParametersChange = (payload: SqlParameterChangePayload) => {
    // Sync your local state on every applied change. `payload.source` is one of:
    //   "initial-state" — post-load snapshot, fired once per question load
    //   "manual-change" — user edited a parameter widget
    //   "auto-change"   — your push was normalized; re-sync from `payload.parameters`
    setSqlParameters(payload.parameters);
  };

  return (
    <InteractiveQuestion
      questionId={questionId}
      sqlParameters={sqlParameters}
      onSqlParametersChange={handleSqlParametersChange}
    />
  );
  // [<endsnippet example-controlled>]
};

const ExampleClear = () => (
  // [<snippet example-clear>]
  // Setting a SQL parameter to `null` clears it (ignores the parameter's default).
  <InteractiveQuestion
    questionId={questionId}
    sqlParameters={{ state: null }}
  />
  // [<endsnippet example-clear>]
);

export { ExampleControlled, ExampleClear };
