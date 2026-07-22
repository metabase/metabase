import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, withRouteProps } from "metabase/router";

import { DataStudioMetricAboutPage } from "./pages/DataStudioMetricAboutPage";
import { DataStudioMetricDependenciesPage } from "./pages/DataStudioMetricDependenciesPage";
import { DataStudioMetricHistoryPage } from "./pages/DataStudioMetricHistoryPage";
import { DataStudioMetricOverviewPage } from "./pages/DataStudioMetricOverviewPage";
import { DataStudioMetricQueryPage } from "./pages/DataStudioMetricQueryPage";
import { DataStudioNewMetricPage } from "./pages/NewMetricPage";

const RoutedDataStudioNewMetricPage = withRouteProps(DataStudioNewMetricPage);
const RoutedDataStudioMetricAboutPage = withRouteProps(
  DataStudioMetricAboutPage,
);
const RoutedDataStudioMetricOverviewPage = withRouteProps(
  DataStudioMetricOverviewPage,
);
const RoutedDataStudioMetricQueryPage = withRouteProps(
  DataStudioMetricQueryPage,
);
const RoutedDataStudioMetricDependenciesPage = withRouteProps(
  DataStudioMetricDependenciesPage,
);
const RoutedDataStudioMetricHistoryPage = withRouteProps(
  DataStudioMetricHistoryPage,
);

export function getDataStudioMetricRoutes() {
  return (
    <Route path="metrics">
      <Route path="new" element={<RoutedDataStudioNewMetricPage />} />
      <Route path=":cardId" element={<RoutedDataStudioMetricAboutPage />} />
      <Route
        path=":cardId/overview"
        element={<RoutedDataStudioMetricOverviewPage />}
      />
      <Route
        path=":cardId/query"
        element={<RoutedDataStudioMetricQueryPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":cardId/dependencies"
          element={<RoutedDataStudioMetricDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route
        path=":cardId/history"
        element={<RoutedDataStudioMetricHistoryPage />}
      />
    </Route>
  );
}
