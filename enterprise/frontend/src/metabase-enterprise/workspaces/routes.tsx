import { Route, type RouteComponent } from "metabase/router";

import { AdminConnectionInfoPage } from "./pages/AdminConnectionInfoPage";
import { WorkspaceIndexPage } from "./pages/WorkspaceIndexPage";

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
      <Route path=":databaseId/admin" element={<AdminConnectionInfoPage />} />
    </Route>
  );
}
