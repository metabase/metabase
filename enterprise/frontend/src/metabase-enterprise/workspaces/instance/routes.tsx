import { IndexRedirect, Route } from "react-router";

import { WorkspaceInstanceOverviewPage } from "./pages/WorkspaceInstanceOverviewPage";
import { WorkspaceInstanceRemappingsPage } from "./pages/WorkspaceInstanceRemappingsPage";

export function getDataStudioWorkspaceInstanceRoutes() {
  return (
    <>
      <IndexRedirect to="overview" />
      <Route path="overview" component={WorkspaceInstanceOverviewPage} />
      <Route path="remappings" component={WorkspaceInstanceRemappingsPage} />
    </>
  );
}
