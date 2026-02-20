import type { RouteObject } from "react-router-dom";

import { IndexRoute, Route } from "metabase/routing/compat/react-router-v3";

import { WorkspaceListPage } from "./pages/WorkspaceListPage/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage/WorkspacePage";

export function getDataStudioWorkspaceRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </>
  );
}

export function getDataStudioWorkspaceRouteObjects(): RouteObject[] {
  return [
    { index: true, element: <WorkspaceListPage /> },
    { path: ":workspaceId", element: <WorkspacePage /> },
  ];
}
