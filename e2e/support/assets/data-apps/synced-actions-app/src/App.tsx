import { useAction } from "@metabase/embedding-sdk-react/data-app";
import { useState } from "react";

import { CreateScore } from "../actions/orders.action";

/**
 * Passes a typed-schema definition to `useAction`, which executes the action in
 * the app's collection by its entity ID. The spec that drives this app writes
 * `actions/orders.action.ts` after creating the action.
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
