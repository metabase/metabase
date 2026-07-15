import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

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
          <Route index component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      <Route path=":cardId/history" component={MetricHistoryPage} />
    </Route>
  );
}
