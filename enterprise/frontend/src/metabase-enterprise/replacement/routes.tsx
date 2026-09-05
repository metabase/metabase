import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

const migrateModelsPage = () =>
  import(
    /* webpackChunkName: "model-replacement" */ "./pages/MigrateModelsPage"
  ).then(({ MigrateModelsPage }) => ({
    Component: MigrateModelsPage,
  }));

registerPagePrefetch(Urls.transformMigrateModels(), migrateModelsPage);

export function getTransformToolsRoutes() {
  return (
    <Route path="tools">
      <Route path="migrate-models" lazy={migrateModelsPage} />
    </Route>
  );
}
