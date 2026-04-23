import { IndexRedirect, IndexRoute, Route } from "react-router";

import { WorkspaceInstance } from "./components/WorkspaceInstance";
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
      <IndexRedirect to="remappings" />
      <Route path="remappings" component={WorkspaceInstance} />
    </>
  );
}
