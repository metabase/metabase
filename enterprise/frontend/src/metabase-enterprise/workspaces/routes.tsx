import { IndexRoute, Route } from "react-router";

import { WorkspaceNavItem } from "./components/WorkspaceNavItem";
import { NewWorkspacePage } from "./pages/NewWorkspacePage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getWorkspaceAdminRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path="new" component={NewWorkspacePage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </>
  );
}

export function getWorkspaceAdminNavItems() {
  return <WorkspaceNavItem />;
}
