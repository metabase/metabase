import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

import { DashboardsSectionLayout } from "./pages/DashboardsSectionLayout";

/**
 * The Data Studio dashboard pages, in one chunk. The section layout stays
 * eager: it frames every page under it, so it is on screen before any of them
 * arrive.
 */
const dashboardsPage = () =>
  import(
    /* webpackChunkName: "data-studio-dashboards" */ "./pages/DashboardsPage"
  ).then(({ DashboardsPage }) => ({ Component: DashboardsPage }));

const dashboardOverviewPage = () =>
  import(
    /* webpackChunkName: "data-studio-dashboards" */ "./pages/DashboardOverviewPage"
  ).then(({ DashboardOverviewPage }) => ({
    Component: DashboardOverviewPage,
  }));

const dashboardContentsPage = () =>
  import(
    /* webpackChunkName: "data-studio-dashboards" */ "./pages/DashboardContentsPage"
  ).then(({ DashboardContentsPage }) => ({
    Component: DashboardContentsPage,
  }));

const dashboardDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-dashboards" */ "./pages/DashboardDependenciesPage"
  ).then(({ DashboardDependenciesPage }) => ({
    Component: DashboardDependenciesPage,
  }));

export function getDataStudioDashboardRoutes() {
  return (
    <Route path="dashboards" element={<DashboardsSectionLayout />}>
      <Route index lazy={dashboardsPage} />
      <Route path=":dashboardId" lazy={dashboardOverviewPage} />
      <Route path=":dashboardId/contents" lazy={dashboardContentsPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":dashboardId/dependencies"
          lazy={dashboardDependenciesPage}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
    </Route>
  );
}
