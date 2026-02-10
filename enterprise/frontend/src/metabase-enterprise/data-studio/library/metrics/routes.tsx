import { IndexRoute, Route } from "react-router";

import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" component={NewMetricPage} />
      <Route path=":cardId" component={MetricOverviewPage} />
      <Route path=":cardId/query" component={MetricQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" component={MetricDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      {PLUGIN_CACHING.isGranularCachingEnabled() && (
        <Route
          path=":cardId/caching"
          component={PLUGIN_CACHING.MetricCachingPage}
        />
      )}
    </Route>
  );
}
