import { Route, type RouteComponent } from "react-router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceIndexPage } from "./pages/WorkspaceIndexPage";

export function getDataStudioRoutes() {
  return <Route path="workspaces" component={WorkspaceIndexPage} />;
}

export function getAdminConnectionInfoRoutes(IsAdmin: RouteComponent) {
  return (
    <Route component={IsAdmin}>
      <Route path=":databaseId/admin" component={AdminConnectionInfoPage} />
    </Route>
  );
}
