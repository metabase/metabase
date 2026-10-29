import { useAction } from "@metabase/embedding-sdk-react/data-app";
import { useState } from "react";

import { actions } from "./metabase";

/**
 * Executes the action that the app's typed schema defines as `addTeam`.
 */
export default function App() {
  const action = useAction(actions.addTeam);
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
