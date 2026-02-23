import type { RouteObject } from "react-router-dom";
import { useParams } from "react-router-dom";

import { WorkspaceListPage } from "./pages/WorkspaceListPage/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage/WorkspacePage";

const WorkspacePageWithRouteProps = () => {
  const params = useParams<{ workspaceId?: string }>();
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
