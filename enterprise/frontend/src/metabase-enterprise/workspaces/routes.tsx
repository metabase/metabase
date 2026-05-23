import { IndexRoute, Route, type RouteComponent } from "react-router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceInstancePage } from "./pages/WorkspaceInstancePage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <IndexRoute component={WorkspaceListPage} />
      <Route path="instance" component={WorkspaceInstancePage} />
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
