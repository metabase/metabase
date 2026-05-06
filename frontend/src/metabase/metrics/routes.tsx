import { IndexRoute, Route } from "react-router";

import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MetricAboutPage } from "./pages/MetricAboutPage";
import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricHistoryPage } from "./pages/MetricHistoryPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

export function getMetricRoutes() {
  return (
    <Route path="metric">
      <Route path="new" component={NewMetricPage} />
      <Route path=":cardId" component={MetricAboutPage} />
      <Route path=":cardId/overview" component={MetricOverviewPage} />
      <Route path=":cardId/query" component={MetricQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" component={MetricDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      <Route path=":cardId/history" component={MetricHistoryPage} />
      {PLUGIN_CACHING.isGranularCachingEnabled() && (
        <Route
          path=":cardId/caching"
          component={PLUGIN_CACHING.MetricCachingPage}
        />
      )}
    </Route>
  );
}
