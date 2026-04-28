import { IndexRoute, Route } from "react-router";

import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getDataStudioWorkspaceRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </>
  );
}
