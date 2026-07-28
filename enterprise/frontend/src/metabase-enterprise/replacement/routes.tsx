import { Route } from "metabase/router";

import { MigrateModelsPage } from "./pages/MigrateModelsPage";

export function getTransformToolsRoutes() {
  return (
    <Route path="tools">
      <Route path="migrate-models" element={<MigrateModelsPage />} />
    </Route>
  );
}
