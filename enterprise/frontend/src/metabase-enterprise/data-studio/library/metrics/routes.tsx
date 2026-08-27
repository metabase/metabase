import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

/**
 * The Data Studio Library metric pages, in the `metrics` chunk.
 *
 * They name the same chunk as the core metric pages they wrap, which saves a
 * request and measures byte-neutral: these wrappers and those pages are each
 * other's only consumers, so merging the two module sets leaves no third chunk
 * to copy the shared half into. Sharing a name with a page that other routes
 * also load does copy it, so measure the total emitted JS before doing this
 * anywhere else.
 *
 * Each of these wraps the core page of the same name. While they were imported
 * eagerly here, `metabase/metrics/pages/*` could not leave the initial bundle
 * however lazy its own routes were, because this module reached them from the
 * other side.
 */
const newMetricPage = () =>
  import(/* webpackChunkName: "metrics" */ "./pages/NewMetricPage").then(
    ({ DataStudioNewMetricPage }) => ({
      Component: DataStudioNewMetricPage,
    }),
  );

const metricAboutPage = () =>
  import(
    /* webpackChunkName: "metrics" */ "./pages/DataStudioMetricAboutPage"
  ).then(({ DataStudioMetricAboutPage }) => ({
    Component: DataStudioMetricAboutPage,
  }));

const metricOverviewPage = () =>
  import(
    /* webpackChunkName: "metrics" */ "./pages/DataStudioMetricOverviewPage"
  ).then(({ DataStudioMetricOverviewPage }) => ({
    Component: DataStudioMetricOverviewPage,
  }));

const metricDimensionsPage = () =>
  import(
    /* webpackChunkName: "metrics" */ "./pages/DataStudioMetricDimensionsPage"
  ).then(({ DataStudioMetricDimensionsPage }) => ({
    Component: DataStudioMetricDimensionsPage,
  }));

const metricQueryPage = () =>
  import(
    /* webpackChunkName: "metrics" */ "./pages/DataStudioMetricQueryPage"
  ).then(({ DataStudioMetricQueryPage }) => ({
    Component: DataStudioMetricQueryPage,
  }));

const metricDependenciesPage = () =>
  import(
    /* webpackChunkName: "metrics" */ "./pages/DataStudioMetricDependenciesPage"
  ).then(({ DataStudioMetricDependenciesPage }) => ({
    Component: DataStudioMetricDependenciesPage,
  }));

const metricHistoryPage = () =>
  import(
    /* webpackChunkName: "metrics" */ "./pages/DataStudioMetricHistoryPage"
  ).then(({ DataStudioMetricHistoryPage }) => ({
    Component: DataStudioMetricHistoryPage,
  }));

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" lazy={newMetricPage} />
      <Route path=":cardId" lazy={metricAboutPage} />
      <Route path=":cardId/overview" lazy={metricOverviewPage} />
      <Route path=":cardId/dimensions" lazy={metricDimensionsPage} />
      <Route path=":cardId/query" lazy={metricQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" lazy={metricDependenciesPage}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":cardId/history" lazy={metricHistoryPage} />
    </Route>
  );
}
