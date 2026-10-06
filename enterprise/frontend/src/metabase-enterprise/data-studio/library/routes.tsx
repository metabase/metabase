import type { ComponentType } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

import { LibrarySectionLayout } from "./LibrarySectionLayout";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { getDataStudioTableRoutes } from "./tables/routes";

/**
 * The section layout stays eager: it frames every page under it, so it is on
 * screen before any of them arrive.
 */
const libraryPage = () =>
  import(/* webpackChunkName: "data-studio-library" */ "./LibraryPage").then(
    ({ LibraryPage }) => ({ Component: LibraryPage }),
  );

const libraryDashboardsPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./dashboards/LibraryDashboardsPage"
  ).then(({ LibraryDashboardsPage }) => ({
    Component: LibraryDashboardsPage,
  }));

const libraryDashboardOverviewPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./dashboards/pages/LibraryDashboardOverviewPage"
  ).then(({ LibraryDashboardOverviewPage }) => ({
    Component: LibraryDashboardOverviewPage,
  }));

const libraryDashboardContentsPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./dashboards/pages/LibraryDashboardContentsPage"
  ).then(({ LibraryDashboardContentsPage }) => ({
    Component: LibraryDashboardContentsPage,
  }));

const libraryDashboardDependenciesPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./dashboards/pages/LibraryDashboardDependenciesPage"
  ).then(({ LibraryDashboardDependenciesPage }) => ({
    Component: LibraryDashboardDependenciesPage,
  }));

const libraryDashboardSubscriptionsPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./dashboards/pages/LibraryDashboardSubscriptionsPage"
  ).then(({ LibraryDashboardSubscriptionsPage }) => ({
    Component: LibraryDashboardSubscriptionsPage,
  }));

const libraryDashboardUsageStatsPage = () =>
  import(
    /* webpackChunkName: "data-studio-library" */ "./dashboards/pages/LibraryDashboardUsageStatsPage"
  ).then(({ LibraryDashboardUsageStatsPage }) => ({
    Component: LibraryDashboardUsageStatsPage,
  }));

export const getDataStudioLibraryRoutes = (IsAdmin: ComponentType) => {
  return (
    <Route path="library" element={<LibrarySectionLayout />}>
      <Route index lazy={libraryPage} />
      <Route path="dashboards">
        <Route index lazy={libraryDashboardsPage} />
        <Route path=":dashboardId" lazy={libraryDashboardOverviewPage} />
        <Route
          path=":dashboardId/contents"
          lazy={libraryDashboardContentsPage}
        />
        <Route
          path=":dashboardId/subscriptions"
          lazy={libraryDashboardSubscriptionsPage}
        />
        <Route
          path=":dashboardId/usage"
          lazy={libraryDashboardUsageStatsPage}
        />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path=":dashboardId/dependencies"
            lazy={libraryDashboardDependenciesPage}
          >
            <Route
              index
              element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />}
            />
          </Route>
        )}
      </Route>
      {getDataStudioTableRoutes(IsAdmin)}
      {getDataStudioMetricRoutes()}
      {getDataStudioSnippetRoutes()}
    </Route>
  );
};
