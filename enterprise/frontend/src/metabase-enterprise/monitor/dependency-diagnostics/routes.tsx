import { Route, redirect } from "metabase/router";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./pages";

export function getDependencyDiagnosticsRoutes() {
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
