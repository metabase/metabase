import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route, withRouteProps } from "metabase/router";

import { MetricAboutPage } from "./pages/MetricAboutPage";
import { MetricDependenciesPage } from "./pages/MetricDependenciesPage";
import { MetricDimensionsPage } from "./pages/MetricDimensionsPage";
import { MetricHistoryPage } from "./pages/MetricHistoryPage";
import { MetricOverviewPage } from "./pages/MetricOverviewPage";
import { MetricQueryPage } from "./pages/MetricQueryPage";
import { NewMetricPage } from "./pages/NewMetricPage";

const RoutedNewMetricPage = withRouteProps(NewMetricPage);
const RoutedMetricAboutPage = withRouteProps(MetricAboutPage);
const RoutedMetricOverviewPage = withRouteProps(MetricOverviewPage);
const RoutedMetricQueryPage = withRouteProps(MetricQueryPage);
const RoutedMetricDimensionsPage = withRouteProps(MetricDimensionsPage);
const RoutedMetricDependenciesPage = withRouteProps(MetricDependenciesPage);
const RoutedMetricHistoryPage = withRouteProps(MetricHistoryPage);

export function getMetricRoutes() {
  return (
    <Route path="metric">
      <Route path="new" element={<RoutedNewMetricPage />} />
      <Route path=":cardId" element={<RoutedMetricAboutPage />} />
      <Route path=":cardId/overview" element={<RoutedMetricOverviewPage />} />
      <Route path=":cardId/query" element={<RoutedMetricQueryPage />} />
      <Route
        path=":cardId/dimensions"
        element={<RoutedMetricDimensionsPage />}
      />
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          path=":cardId/dependencies"
          element={<RoutedMetricDependenciesPage />}
        >
          <Route index element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />} />
        </Route>
      )}
      <Route path=":cardId/history" element={<RoutedMetricHistoryPage />} />
    </Route>
  );
}
