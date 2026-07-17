import { Route, redirect } from "metabase/router";
import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "metabase-enterprise/monitor/dependency-diagnostics/pages";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getDataStudioDependencyRoutes() {
  return <Route index component={DependencyGraphPage} />;
}

export function getDataStudioDependencyDiagnosticsRoutes() {
  return (
    <>
      <Route index component={redirect("broken")} />
      <Route path="broken" component={BrokenDependencyDiagnosticsPage} />
      <Route
        path="unreferenced"
        component={UnreferencedDependencyDiagnosticsPage}
      />
    </>
  );
}
