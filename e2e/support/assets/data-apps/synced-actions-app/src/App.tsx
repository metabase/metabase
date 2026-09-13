import { useAction } from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { CreateScore } from "../actions/orders.action";

/**
 * Passes a source-controlled definition to `useAction` rather than a bare ID, so
 * a production build executes whatever `sync-resources` wrote into it — the copy
 * the app's own group is permitted to run. The spec that drives this app writes
 * `actions/orders.action.ts` before synchronizing.
 */
export default function App() {
  const action = useAction(CreateScore);
  const [output, setOutput] = useState("idle");

  const onExecute = async () => {
    try {
      await action.execute({ team_name: "Data App FC", score: 7 });
      setOutput("executed");
    } catch (error) {
      setOutput(`threw: ${String(error)}`);
    }
  };

  return (
    <div data-testid="synced-actions-content" style={{ padding: 24 }}>
      <h1>Synced actions app</h1>

      <button type="button" data-testid="action-execute" onClick={onExecute}>
        execute
      </button>

      <div data-testid="action-output">{output}</div>
      <div data-testid="action-error">
        {action.error ? "has-error" : "no-error"}
      </div>
    </div>
  );
}
