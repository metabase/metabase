import { IndexRoute } from "react-router";

import { WorkspaceListPage } from "./pages/WorkspaceListPage";

export function getDataStudioWorkspaceRoutes() {
  return <IndexRoute component={WorkspaceListPage} />;
}
