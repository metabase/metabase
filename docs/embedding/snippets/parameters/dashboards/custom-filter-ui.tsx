import { InteractiveDashboard } from "@metabase/embedding-sdk-react";
import { useState } from "react";

const dashboardId = 1;

const Example = () => {
  // [<snippet example>]
  // Your widget owns the value. Metabase's State widget stays hidden.
  const [state, setState] = useState("NY");

  return (
    <>
      <select value={state} onChange={(event) => setState(event.target.value)}>
        <option value="NY">New York</option>
        <option value="CA">California</option>
      </select>

      <InteractiveDashboard
        dashboardId={dashboardId}
        parameters={{ state }}
        hiddenParameters={["state"]}
      />
    </>
  );
  // [<endsnippet example>]
};

export { Example };
