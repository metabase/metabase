import {
  InteractiveDashboard,
  type ParameterChangePayload,
  type ParameterValues,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

const dashboardId = 1;

const ExampleControlled = () => {
  // [<snippet example-controlled>]
  const [parameters, setParameters] = useState<ParameterValues>({
    state: "NY",
  });

  const handleParametersChange = (payload: ParameterChangePayload) => {
    // Sync your local state on every applied change. `payload.source` is one of:
    //   "initial-state" — post-load snapshot, fired once per dashboard load
    //   "manual-change" — user edited a parameter widget
    //   "auto-change"   — your push was normalized; re-sync from `payload.parameters`
    setParameters(payload.parameters);
  };

  return (
    <InteractiveDashboard
      dashboardId={dashboardId}
      parameters={parameters}
      onParametersChange={handleParametersChange}
    />
  );
  // [<endsnippet example-controlled>]
};

const ExampleClearOne = () => (
  // [<snippet example-clear-one>]
  // Setting a parameter to `null` clears it (ignores the parameter's default).
  // Missing slugs fall back to `parameter.default ?? null`.
  <InteractiveDashboard
    dashboardId={dashboardId}
    parameters={{ state: null, city: "Austin" }}
  />
  // [<endsnippet example-clear-one>]
);

const ExampleClearAll = () => (
  // [<snippet example-clear-all>]
  // Pass an empty object to clear every parameter.
  <InteractiveDashboard dashboardId={dashboardId} parameters={{}} />
  // [<endsnippet example-clear-all>]
);

export { ExampleControlled, ExampleClearOne, ExampleClearAll };
