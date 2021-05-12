import React from "react";

import { Route } from "metabase/hoc/Title";
import { IndexRoute, IndexRedirect } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import AuditApp from "./containers/AuditApp";

import AuditOverview from "./pages/AuditOverview";

import AuditDatabases from "./pages/AuditDatabases";
import AuditDatabaseDetail from "./pages/AuditDatabaseDetail";
import AuditSchemas from "./pages/AuditSchemas";
import AuditSchemaDetail from "./pages/AuditSchemaDetail";
import AuditTables from "./pages/AuditTables";
import AuditTableDetail from "./pages/AuditTableDetail";

import AuditQuestions from "./pages/AuditQuestions";
import AuditQuestionDetail from "./pages/AuditQuestionDetail";
import AuditDashboards from "./pages/AuditDashboards";
import AuditDashboardDetail from "./pages/AuditDashboardDetail";
import AuditQueryDetail from "./pages/AuditQueryDetail";

import AuditUsers from "./pages/AuditUsers";
import AuditUserDetail from "./pages/AuditUserDetail";

import AuditDownloads from "./pages/AuditDownloads";

type Page = {
  tabs?: Tab[],
};

type Tab = {
  path: string,
  title: string,
  component?: any,
};

function getPageRoutes(path, page: Page) {
  const subRoutes = [];
  // add a redirect for the default tab
  const defaultTab = getDefaultTab(page);
  if (defaultTab) {
    subRoutes.push(<IndexRedirect to={defaultTab.path} />);
  }
  // add sub routes for each tab
  if (page.tabs) {
    subRoutes.push(
      ...page.tabs.map(tab => (
        <Route key={tab.path} path={tab.path} component={tab.component} />
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

function getDefaultTab(page: Page): ?Tab {
  // use the tab with "default = true" or the first
  return (
    _.findWhere(page.tabs, { default: true }) ||
    (page.tabs && page.tabs[0]) ||
    null
  );
}

const getRoutes = (store: any) => (
  <Route path="audit" title={t`Audit`} component={AuditApp}>
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
  </Route>
);

export default getRoutes;
