import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";

import { DataStudioMetricAboutPage } from "./pages/DataStudioMetricAboutPage";
import { DataStudioMetricDependenciesPage } from "./pages/DataStudioMetricDependenciesPage";
import { DataStudioMetricHistoryPage } from "./pages/DataStudioMetricHistoryPage";
import { DataStudioMetricOverviewPage } from "./pages/DataStudioMetricOverviewPage";
import { DataStudioMetricQueryPage } from "./pages/DataStudioMetricQueryPage";
import { DataStudioNewMetricPage } from "./pages/NewMetricPage";

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" element={<DataStudioNewMetricPage />} />
      <Route path=":cardId" element={<DataStudioMetricAboutPage />} />
      <Route
        path=":cardId/overview"
        element={<DataStudioMetricOverviewPage />}
      />
      <Route path=":cardId/query" element={<DataStudioMetricQueryPage />} />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":cardId/dependencies"
          element={<DataStudioMetricDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":cardId/history" element={<DataStudioMetricHistoryPage />} />
    </Route>
  );
}
