import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const dashboardId = 1;

const Example = () => (
  // [<snippet example>]
  <InteractiveDashboard
    dashboardId={dashboardId}
    initialParameters={{ state: "NY" }}
    hiddenParameters={["state"]}
  />
  // [<endsnippet example>]
);

export { Example };
