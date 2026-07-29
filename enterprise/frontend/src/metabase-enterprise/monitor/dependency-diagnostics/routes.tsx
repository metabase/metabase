import { Route, redirect, withRouteProps } from "metabase/router";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./pages";

const RoutedBrokenDependencyDiagnosticsPage = withRouteProps(
  BrokenDependencyDiagnosticsPage,
);
const RoutedUnreferencedDependencyDiagnosticsPage = withRouteProps(
  UnreferencedDependencyDiagnosticsPage,
);

export function getDependencyDiagnosticsRoutes() {
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
