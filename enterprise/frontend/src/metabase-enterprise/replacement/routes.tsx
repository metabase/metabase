import { Route } from "react-router";

import { MigratePersistedModelsPage } from "./pages/MigratePersistedModelsPage";

export function getTransformToolsRoutes() {
  return (
    <Route path="tools">
      <Route
        path="migrate-persisted-models"
        component={MigratePersistedModelsPage}
      />
    </Route>
  );
}
