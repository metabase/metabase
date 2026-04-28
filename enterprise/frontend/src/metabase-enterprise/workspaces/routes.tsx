import { IndexRoute, Route } from "react-router";

import { TableRemappingPage } from "./components/TableRemappingPage";
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

export function getWorkspaceAdminFullWidthRoutes() {
  return <Route path="table-remapping" component={TableRemappingPage} />;
}
