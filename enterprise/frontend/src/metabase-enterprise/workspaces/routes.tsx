import { Route, type RouteComponent, withRouteProps } from "metabase/router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceIndexPage } from "./pages/WorkspaceIndexPage";

const RoutedAdminConnectionInfoPage = withRouteProps(AdminConnectionInfoPage);

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <Route index element={<WorkspaceIndexPage />} />
    </Route>
  );
}

export function getWorkspaceDatabaseRoutes(IsAdmin: RouteComponent) {
  return (
    <Route element={<IsAdmin />}>
      <Route
        path=":databaseId/admin"
        element={<RoutedAdminConnectionInfoPage />}
      />
    </Route>
  );
}
