import { Route, redirect } from "metabase/router";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./pages";

export function getDependencyDiagnosticsRoutes() {
  return (
    <>
      <Route index element={redirect("broken")} />
      <Route path="broken" element={<BrokenDependencyDiagnosticsPage />} />
      <Route
        path="unreferenced"
        element={<UnreferencedDependencyDiagnosticsPage />}
      />
    </>
  );
}
