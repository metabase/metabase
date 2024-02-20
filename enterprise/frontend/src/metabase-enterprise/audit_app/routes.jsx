import { IndexRoute, IndexRedirect } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { createAdminRouteGuard } from "metabase/admin/utils";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";

import AuditApp from "./containers/AuditApp";
import UnsubscribeUserModal from "./containers/UnsubscribeUserModal/UnsubscribeUserModal";
import AuditDashboardDetail from "./pages/AuditDashboardDetail";
import AuditDashboards from "./pages/AuditDashboards";
import AuditDatabaseDetail from "./pages/AuditDatabaseDetail";
import AuditDatabases from "./pages/AuditDatabases";
import AuditDownloads from "./pages/AuditDownloads";
import AuditOverview from "./pages/AuditOverview";
import AuditQueryDetail from "./pages/AuditQueryDetail";
import AuditQuestionDetail from "./pages/AuditQuestionDetail";
import AuditQuestions from "./pages/AuditQuestions";
import AuditSchemaDetail from "./pages/AuditSchemaDetail";
import AuditSchemas from "./pages/AuditSchemas";
import AuditSubscriptions from "./pages/AuditSubscriptions";
import AuditTableDetail from "./pages/AuditTableDetail";
import AuditTables from "./pages/AuditTables";
import AuditUserDetail from "./pages/AuditUserDetail";
import AuditUsers from "./pages/AuditUsers";

function getPageRoutes(path, page) {
  const subRoutes = [];
  // add a redirect for the default tab
  const defaultTab = getDefaultTab(page);
  if (defaultTab) {
    subRoutes.push(
      <IndexRedirect key={defaultTab.path} to={defaultTab.path} />,
    );
  }
  // add sub routes for each tab
  if (page.tabs) {
    subRoutes.push(
      ...page.tabs.map(tab => (
        <Route key={tab.path} path={tab.path} component={tab.component}>
          {tab.modals &&
            tab.modals.map(modal => (
              <ModalRoute
                key={modal.path}
                path={modal.path}
                modal={modal.modal}
              />
            ))}
        </Route>
      )),
    );
  }
  // if path is provided, use that, otherwise use an IndexRoute
  return path ? (
    <Route path={path} component={page}>
      {subRoutes}
    </Route>
  ) : (
    <IndexRoute component={page}>{subRoutes}</IndexRoute>
  );
}

function getDefaultTab(page) {
  // use the tab with "default = true" or the first
  return (
    _.findWhere(page.tabs, { default: true }) ||
    (page.tabs && page.tabs[0]) ||
    null
  );
}

const getRoutes = store => (
  <Route
    key="audit"
    path="audit"
    title={t`Audit`}
    component={createAdminRouteGuard("audit", AuditApp)}
  >
    {/* <IndexRedirect to="overview" /> */}
    <IndexRedirect to="members" />

    <Route path="overview" component={AuditOverview} />

    {getPageRoutes("databases", AuditDatabases)}
    {getPageRoutes("database/:databaseId", AuditDatabaseDetail)}
    {getPageRoutes("schemas", AuditSchemas)}
    {getPageRoutes("schema/:schemaId", AuditSchemaDetail)}
    {getPageRoutes("tables", AuditTables)}
    {getPageRoutes("table/:tableId", AuditTableDetail)}
    {getPageRoutes("dashboards", AuditDashboards)}
    {getPageRoutes("dashboard/:dashboardId", AuditDashboardDetail)}
    {getPageRoutes("questions", AuditQuestions)}
    {getPageRoutes("question/:questionId", AuditQuestionDetail)}
    {getPageRoutes("query/:queryHash", AuditQueryDetail)}
    {getPageRoutes("downloads", AuditDownloads)}
    {getPageRoutes("members", AuditUsers)}
    {getPageRoutes("member/:userId", AuditUserDetail)}
    {getPageRoutes("subscriptions", AuditSubscriptions)}
  </Route>
);

export const getUserMenuRotes = () => (
  <ModalRoute path="unsubscribe" modal={UnsubscribeUserModal} />
);

export default getRoutes;
