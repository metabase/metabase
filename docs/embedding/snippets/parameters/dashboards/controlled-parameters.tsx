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

export { ExampleControlled };
