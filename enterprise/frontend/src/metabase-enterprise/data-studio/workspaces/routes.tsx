import type { RouteObject } from "react-router-dom";

import { WorkspaceListPage } from "./pages/WorkspaceListPage/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage/WorkspacePage";

export function getDataStudioWorkspaceRoutes() {
  return null;
}

export function getDataStudioWorkspaceRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <WorkspaceListPage /> },
    { path: ":workspaceId", element: <WorkspacePage /> },
  ];
}
