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
      <Route path="new" element={<NewMetricPage />} />
      <Route path=":cardId" element={<MetricAboutPage />} />
      <Route path=":cardId/overview" element={<MetricOverviewPage />} />
      <Route path=":cardId/query" element={<MetricQueryPage />} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route path=":cardId/dependencies" element={<MetricDependenciesPage />}>
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":cardId/history" element={<MetricHistoryPage />} />
    </Route>
  );
}
