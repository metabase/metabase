import { EditableDashboard } from "@metabase/embedding-sdk-react";

const dashboardId = "Xk3YzAbCdEfGhIjKlMnOp";

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
