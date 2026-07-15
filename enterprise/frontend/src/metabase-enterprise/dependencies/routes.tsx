import { Route, redirect, withRouteProps } from "metabase/router";
import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "metabase-enterprise/monitor/dependency-diagnostics/pages";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

const RoutedDependencyGraphPage = withRouteProps(DependencyGraphPage);
const RoutedBrokenDependencyDiagnosticsPage = withRouteProps(
  BrokenDependencyDiagnosticsPage,
);
const RoutedUnreferencedDependencyDiagnosticsPage = withRouteProps(
  UnreferencedDependencyDiagnosticsPage,
);

export function getDataStudioDependencyRoutes() {
  return <Route index element={<RoutedDependencyGraphPage />} />;
}

export function getDataStudioDependencyDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("broken")} />
      <Route
        path="broken"
        element={<RoutedBrokenDependencyDiagnosticsPage />}
      />
      <Route
        path="unreferenced"
        element={<RoutedUnreferencedDependencyDiagnosticsPage />}
      />
    </>
  );
}
