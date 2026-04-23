import { IndexRedirect, IndexRoute, Route } from "react-router";

import { NewWorkspacePage } from "./pages/NewWorkspacePage";
import { QueryExecutionPage } from "./pages/QueryExecutionPage";
import { WorkspaceInstanceOverviewPage } from "./pages/WorkspaceInstanceOverviewPage";
import { WorkspaceInstanceRemappingsPage } from "./pages/WorkspaceInstanceRemappingsPage";
import { WorkspaceInstanceRunsPage } from "./pages/WorkspaceInstanceRunsPage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getDataStudioWorkspaceRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path="new" component={NewWorkspacePage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </>
  );
}

export function getDataStudioWorkspaceInstanceRoutes() {
  return (
    <>
      <IndexRedirect to="overview" />
      <Route path="overview" component={WorkspaceInstanceOverviewPage} />
      <Route path="query-execution" component={QueryExecutionPage} />
      <Route path="remappings" component={WorkspaceInstanceRemappingsPage} />
      <Route path="runs" component={WorkspaceInstanceRunsPage} />
    </>
  );
}
