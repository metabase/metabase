import { IndexRedirect, Route } from "react-router";

import { WorkspacesTableRemappingPage } from "./components/WorkspacesTableRemappingPage";
import { NewWorkspacePage } from "./pages/NewWorkspacePage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspaceModePage } from "./pages/WorkspaceModePage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getWorkspaceAdminRoutes() {
  return (
    <>
      <IndexRedirect to="mode" />
      <Route path="mode" component={WorkspaceModePage} />
      <Route path="provisioning" component={WorkspaceListPage} />
      <Route path="provisioning/new" component={NewWorkspacePage} />
      <Route path="provisioning/:workspaceId" component={WorkspacePage} />
      <Route path="table-remapping" component={WorkspacesTableRemappingPage} />
    </>
  );
}
