import { IndexRoute, Route } from "react-router";

import { NewWorkspacePage } from "./pages/NewWorkspacePage";
import { WorkspaceDatabaseListPage } from "./pages/WorkspaceDatabaseListPage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspaceOverviewPage } from "./pages/WorkspaceOverviewPage";

export function getDataStudioWorkspaceRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path="new" component={NewWorkspacePage} />
      <Route path=":workspaceId" component={WorkspaceOverviewPage} />
      <Route
        path=":workspaceId/databases"
        component={WorkspaceDatabaseListPage}
      />
    </>
  );
}
