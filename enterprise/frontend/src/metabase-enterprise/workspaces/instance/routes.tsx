import { IndexRedirect, Route } from "react-router";

import { WorkspaceInstanceChangesPage } from "./pages/WorkspaceInstanceChangesPage";
import { WorkspaceInstanceOverviewPage } from "./pages/WorkspaceInstanceOverviewPage";
import { WorkspaceInstanceRemappingsPage } from "./pages/WorkspaceInstanceRemappingsPage";

export function getDataStudioWorkspaceInstanceRoutes() {
  return (
    <>
      <IndexRedirect to="overview" />
      <Route path="overview" component={WorkspaceInstanceOverviewPage} />
      <Route path="changes" component={WorkspaceInstanceChangesPage} />
      <Route path="remappings" component={WorkspaceInstanceRemappingsPage} />
    </>
  );
}
