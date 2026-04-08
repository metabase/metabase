import { Route } from "react-router";

import { MigrateModelsPage } from "./pages/MigrateModelsPage";

export function getTransformToolsRoutes() {
  return (
    <Route path="tools">
      <Route path="migrate-models" component={MigrateModelsPage} />
    </Route>
  );
}
