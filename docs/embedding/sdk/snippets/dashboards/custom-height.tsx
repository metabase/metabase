import { EditableDashboard } from "@metabase/embedding-sdk-react";

const dashboardId = 1;

const Example = () => (
  // [<snippet example>]
  <EditableDashboard
    style={{
      height: 800,
      minHeight: "auto",
    }}
    dashboardId={dashboardId}
  />
  // [<endsnippet example>]
);
