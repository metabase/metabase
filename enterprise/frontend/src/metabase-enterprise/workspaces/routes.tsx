import { IndexRoute, Route } from "react-router";
import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import * as Urls from "metabase/utils/urls";

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
  return (
    <AdminNavItem
      path={Urls.adminWorkspaceList()}
      label={t`Workspaces`}
      icon="folder"
    />
  );
}
