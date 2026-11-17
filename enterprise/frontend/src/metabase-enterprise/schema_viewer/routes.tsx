import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { loadSchemaViewerPage } from "./lazy";

const schemaViewerPage = () =>
  loadSchemaViewerPage().then(({ SchemaViewerPage }) => ({
    Component: SchemaViewerPage,
  }));

/**
 * Called from the licensed branch of `initializePlugin`, so only a page this
 * instance mounts is registered. The background pass reads the registrations too,
 * and fetching a page nobody can reach would spend a download on nothing.
 */
export function registerSchemaViewerPagePrefetch(): void {
  registerPagePrefetch(Urls.dataStudioSchemaViewer(), schemaViewerPage);
}

export function getDataStudioSchemaViewerRoutes() {
  return <Route index lazy={schemaViewerPage} />;
}
