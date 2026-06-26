import { IndexRoute, Route } from "react-router";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { DataStudioMetricAboutPage } from "./pages/DataStudioMetricAboutPage";
import { DataStudioMetricDependenciesPage } from "./pages/DataStudioMetricDependenciesPage";
import { DataStudioMetricDimensionsPage } from "./pages/DataStudioMetricDimensionsPage";
import { DataStudioMetricHistoryPage } from "./pages/DataStudioMetricHistoryPage";
import { DataStudioMetricOverviewPage } from "./pages/DataStudioMetricOverviewPage";
import { DataStudioMetricQueryPage } from "./pages/DataStudioMetricQueryPage";
import { DataStudioNewMetricPage } from "./pages/NewMetricPage";

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" component={DataStudioNewMetricPage} />
      <Route path=":cardId" component={DataStudioMetricAboutPage} />
      <Route path=":cardId/overview" component={DataStudioMetricOverviewPage} />
      <Route path=":cardId/query" component={DataStudioMetricQueryPage} />
      <Route
        path=":cardId/dimensions"
        component={DataStudioMetricDimensionsPage}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":cardId/dependencies"
          component={DataStudioMetricDependenciesPage}
        >
          <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
        </Route>
      )}
      <Route path=":cardId/history" component={DataStudioMetricHistoryPage} />
    </Route>
  );
}
