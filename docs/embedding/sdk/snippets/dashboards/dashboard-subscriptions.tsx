import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const dashboardId = "Xk3YzAbCdEfGhIjKlMnOp";

const Example = () => (
  // [<snippet example>]
  <InteractiveDashboard dashboardId={dashboardId} withSubscriptions />
  // [<endsnippet example>]
);
