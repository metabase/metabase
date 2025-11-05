import { IndexRoute } from "react-router";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" component={NewMetricPage} />
      <Route path=":metricId" component={MetricOverviewPage} />
      <Route path=":metricId/query" component={MetricQueryPage} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":metricId/dependencies" component={MetricDependenciesPage}>
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
    </Route>
  );
}
