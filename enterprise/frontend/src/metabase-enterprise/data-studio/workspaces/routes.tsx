import type { RouteObject } from "react-router-dom";

import { useCompatParams } from "metabase/routing/compat";

import { WorkspaceListPage } from "./pages/WorkspaceListPage/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage/WorkspacePage";

const WorkspacePageWithRouteProps = () => {
  const params = useCompatParams<{ workspaceId?: string }>();
  return <WorkspacePage params={{ workspaceId: params.workspaceId ?? "" }} />;
};

export function getDataStudioWorkspaceRoutes() {
  return null;
}

export function getDataStudioWorkspaceRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <WorkspaceListPage /> },
    { path: ":workspaceId", element: <WorkspacePageWithRouteProps /> },
  ];
}
