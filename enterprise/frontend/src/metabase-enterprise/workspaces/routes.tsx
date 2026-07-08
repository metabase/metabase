import { IndexRoute, Route, type RouteComponent } from "metabase/router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { InstanceListPage } from "./pages/InstanceListPage";
import { WorkspaceIndexPage } from "./pages/WorkspaceIndexPage";

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <IndexRoute component={WorkspaceIndexPage} />
      <Route path="instances" component={InstanceListPage} />
    </Route>
  );
}

export function getWorkspaceDatabaseRoutes(IsAdmin: RouteComponent) {
  return (
    <Route component={IsAdmin}>
      <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />
    </Route>
  );
}
