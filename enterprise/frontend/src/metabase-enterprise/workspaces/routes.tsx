import { Route } from "react-router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { NewWorkspacePage } from "./pages/NewWorkspacePage";

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <Route path="new" component={NewWorkspacePage} />
    </Route>
  );
}

export function getAdminConnectionInfoRoutes() {
  return <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />;
}
