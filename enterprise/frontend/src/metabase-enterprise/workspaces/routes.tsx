import { IndexRoute, Route } from "react-router";
import { t } from "ttag";

import { AdminNavItem } from "metabase/admin/components/AdminNav";
import * as Urls from "metabase/utils/urls";

import { DevelopmentInstancePage } from "./pages/DevelopmentInstancePage";
import { WorkspaceListPage } from "./pages/WorkspaceListPage";
import { WorkspacePage } from "./pages/WorkspacePage";

export function getWorkspaceAdminRoutes() {
  return (
    <>
      <IndexRoute component={WorkspaceListPage} />
      <Route path="development-instance" component={DevelopmentInstancePage} />
      <Route path=":workspaceId" component={WorkspacePage} />
    </>
  );
}

export function getWorkspaceAdminNavItems() {
  return (
    <>
      <AdminNavItem
        path={Urls.adminWorkspaceList()}
        label={t`Workspaces`}
        icon="folder"
      />
      <AdminNavItem
        path={Urls.adminDeveloperInstance()}
        label={t`Development instance`}
        icon="database"
      />
    </>
  );
}
