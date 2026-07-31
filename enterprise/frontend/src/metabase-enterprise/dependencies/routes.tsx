import { Route } from "metabase/router";

import { DependencyGraphPage } from "./pages/DependencyGraphPage";

export function getDataStudioDependencyRoutes() {
  return <Route index element={<DependencyGraphPage />} />;
}
