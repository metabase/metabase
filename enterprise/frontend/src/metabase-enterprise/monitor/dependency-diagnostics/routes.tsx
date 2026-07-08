import { IndexRedirect, Route } from "metabase/router";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./pages";

export function getDependencyDiagnosticsRoutes() {
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
