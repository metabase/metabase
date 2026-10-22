import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

const migrateModelsPage = () =>
  import(
    /* webpackChunkName: "model-replacement" */ "./pages/MigrateModelsPage"
  ).then(({ MigrateModelsPage }) => ({
    Component: MigrateModelsPage,
  }));

/**
 * Called from the licensed branch of `initializePlugin`, so only a page this
 * instance mounts is registered. The background pass reads the registrations too,
 * and fetching a page nobody can reach would spend a download on nothing.
 */
export function registerReplacementPagePrefetch(): void {
  registerPagePrefetch(Urls.transformMigrateModels(), migrateModelsPage);
}

export function getTransformToolsRoutes() {
  return (
    <Route path="tools">
      <Route path="migrate-models" lazy={migrateModelsPage} />
    </Route>
  );
}
