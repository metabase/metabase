import { IndexRoute, Route } from "react-router";

import { WorkspacesTableRemappingsPage } from "./components/WorkspacesTableRemappingsPage";
import { NewWorkspacePage } from "./pages/NewWorkspacePage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getWorkspaceAdminRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path="new" component={NewWorkspacePage} />
      <Route
        path="table-remappings"
        component={WorkspacesTableRemappingsPage}
      />
      <Route path=":workspaceId" component={WorkspacePage} />
    </>
  );
}
