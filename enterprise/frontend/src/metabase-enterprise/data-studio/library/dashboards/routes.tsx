import { libraryUpsellPage } from "metabase/data-studio/routes";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { notFoundRoute } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { DashboardsSectionLayout } from "./pages/DashboardsSectionLayout";

const dashboardsSectionLayout: PluginRoute = () =>
  Promise.resolve({ Component: DashboardsSectionLayout });

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

const dashboardUsageStatsPage = () =>
  import(
    /* webpackChunkName: "data-studio-dashboards" */ "./pages/DashboardUsageStatsPage"
  ).then(({ DashboardUsageStatsPage }) => ({
    Component: DashboardUsageStatsPage,
  }));

const dashboardSubscriptionsPage = () =>
  import(
    /* webpackChunkName: "data-studio-dashboards" */ "./pages/DashboardSubscriptionsPage"
  ).then(({ DashboardSubscriptionsPage }) => ({
    Component: DashboardSubscriptionsPage,
  }));

export function getDataStudioDashboardRoutes() {
  return (
    <Route
      path="dashboards"
      lazy={featureGatedRoute(
        "library",
        dashboardsSectionLayout,
        libraryUpsellPage,
      )}
    >
      <Route index lazy={dashboardsPage} />
      <Route path=":dashboardId" lazy={dashboardOverviewPage} />
      <Route path=":dashboardId/contents" lazy={dashboardContentsPage} />
      <Route path=":dashboardId/dependencies" lazy={dashboardDependenciesPage}>
        <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
      </Route>
      <Route
        path=":dashboardId/usage"
        lazy={featureGatedRoute(
          "audit_app",
          dashboardUsageStatsPage,
          notFoundRoute,
        )}
      />
      <Route
        path=":dashboardId/subscriptions/:subscriptionId?"
        lazy={dashboardSubscriptionsPage}
      />
    </Route>
  );
}
