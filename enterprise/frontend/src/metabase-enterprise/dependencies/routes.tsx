import { IndexRedirect, IndexRoute, Route } from "react-router";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "metabase-enterprise/monitor/dependency-diagnostics/pages";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getDataStudioDependencyRoutes() {
  return <IndexRoute component={DependencyGraphPage} />;
}

export function getDataStudioDependencyDiagnosticsRoutes() {
  return (
    <>
      <IndexRedirect to="broken" />
      <Route path="broken" component={BrokenDependencyDiagnosticsPage} />
      <Route
        path="unreferenced"
        component={UnreferencedDependencyDiagnosticsPage}
      />
    </>
  );
}
