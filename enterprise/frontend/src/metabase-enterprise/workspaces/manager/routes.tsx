import { IndexRoute, Route } from "react-router";

import { WorkspaceAccessKeysPage } from "./pages/WorkspaceAccessKeysPage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspaceSetupPage } from "./pages/WorkspaceSetupPage";

export function getDataStudioWorkspaceManagerRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path=":workspaceId">
        <IndexRoute component={WorkspaceSetupPage} />
        <Route path="access-keys" component={WorkspaceAccessKeysPage} />
      </Route>
    </>
  );
}
