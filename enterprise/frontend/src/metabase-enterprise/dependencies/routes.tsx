import { Route, withRouteProps } from "metabase/router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

const RoutedDependencyGraphPage = withRouteProps(DependencyGraphPage);

export function getDataStudioDependencyRoutes() {
  return <Route index element={<RoutedDependencyGraphPage />} />;
}
