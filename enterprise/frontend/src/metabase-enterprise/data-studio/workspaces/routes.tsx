import { IndexRoute, Route } from "react-router";

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
