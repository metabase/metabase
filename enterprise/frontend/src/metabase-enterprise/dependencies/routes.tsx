import { Route } from "metabase/router";

import { loadDependencyGraphRoute } from "./lazy";

export function getDataStudioDependencyRoutes() {
  return <Route index lazy={loadDependencyGraphRoute} />;
}
