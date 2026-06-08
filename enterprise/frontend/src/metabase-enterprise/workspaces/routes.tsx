import { IndexRoute, Route, type RouteComponent } from "react-router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceIndexPage } from "./pages/WorkspaceIndexPage";
import { WorkspaceInstanceListPage } from "./pages/WorkspaceInstanceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <IndexRoute component={WorkspaceIndexPage} />
      <Route path="instances" component={WorkspaceInstanceListPage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </Route>
  );
}

export function getAdminConnectionInfoRoutes(IsAdmin: RouteComponent) {
  return (
    <Route component={IsAdmin}>
      <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />
    </Route>
  );
}
