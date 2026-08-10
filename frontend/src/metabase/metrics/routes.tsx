import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, registerPagePrefetch } from "metabase/router";

/**
 * The metric pages, in their own chunk. Several of them render a visualization.
 *
 * No prefetch registration for the per-metric pages: their paths carry the card
 * id before the segment that names the page, and the registry matches on a
 * prefix, so any prefix short enough to match would cover every metric page.
 */
const newMetricPage = () =>
  import("./pages/NewMetricPage").then(({ NewMetricPage }) => ({
    Component: NewMetricPage,
  }));

const metricAboutPage = () =>
  import("./pages/MetricAboutPage").then(({ MetricAboutPage }) => ({
    Component: MetricAboutPage,
  }));

const metricOverviewPage = () =>
  import("./pages/MetricOverviewPage").then(({ MetricOverviewPage }) => ({
    Component: MetricOverviewPage,
  }));

const metricQueryPage = () =>
  import("./pages/MetricQueryPage").then(({ MetricQueryPage }) => ({
    Component: MetricQueryPage,
  }));

const metricDimensionsPage = () =>
  import("./pages/MetricDimensionsPage").then(({ MetricDimensionsPage }) => ({
    Component: MetricDimensionsPage,
  }));

const metricDependenciesPage = () =>
  import("./pages/MetricDependenciesPage").then(
    ({ MetricDependenciesPage }) => ({ Component: MetricDependenciesPage }),
  );

const metricHistoryPage = () =>
  import("./pages/MetricHistoryPage").then(({ MetricHistoryPage }) => ({
    Component: MetricHistoryPage,
  }));

registerPagePrefetch("/metric/new", newMetricPage);

export function getMetricRoutes() {
  return (
    <Route path="metric">
      <Route path="new" lazy={newMetricPage} />
      <Route path=":cardId" lazy={metricAboutPage} />
      <Route path=":cardId/overview" lazy={metricOverviewPage} />
      <Route path=":cardId/query" lazy={metricQueryPage} />
      <Route path=":cardId/dimensions" lazy={metricDimensionsPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" lazy={metricDependenciesPage}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":cardId/history" lazy={metricHistoryPage} />
    </Route>
  );
}
