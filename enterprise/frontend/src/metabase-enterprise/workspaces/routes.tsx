import { IndexRedirect, IndexRoute, Route } from "react-router";

import {
  WorkspaceInstance,
  WorkspaceInstanceOverview,
  WorkspaceInstanceRuns,
} from "./components/WorkspaceInstance";
import { NewWorkspacePage } from "./pages/NewWorkspacePage";
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
      <Route path="overview" component={WorkspaceInstanceOverview} />
      <Route path="remappings" component={WorkspaceInstance} />
      <Route path="runs" component={WorkspaceInstanceRuns} />
    </>
  );
}
