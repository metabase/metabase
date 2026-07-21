import { Route, type RouteComponent, withRouteProps } from "metabase/router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";

const RoutedAdminConnectionInfoPage = withRouteProps(AdminConnectionInfoPage);

export function getDataStudioRoutes() {
  return (
    <Route path="workspaces">
      <Route index element={<WorkspaceListPage />} />
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
