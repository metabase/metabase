import { IndexRoute, Route } from "react-router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <IndexRoute component={WorkspaceListPage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </Route>
  );
}

export function getAdminConnectionInfoRoutes() {
  return <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />;
}
