import { Route } from "metabase/router";

const migrateModelsPage = () =>
  import("./pages/MigrateModelsPage").then(({ MigrateModelsPage }) => ({
    Component: MigrateModelsPage,
  }));

export function getTransformToolsRoutes() {
  return (
    <Route path="tools">
      <Route path="migrate-models" lazy={migrateModelsPage} />
    </Route>
  );
}
