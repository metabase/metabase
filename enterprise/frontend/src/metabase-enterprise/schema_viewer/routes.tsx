import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { loadSchemaViewerPage } from "./lazy";

const schemaViewerPage = () =>
  loadSchemaViewerPage().then(({ SchemaViewerPage }) => ({
    Component: SchemaViewerPage,
  }));

registerPagePrefetch(Urls.dataStudioSchemaViewer(), schemaViewerPage);

export function getDataStudioSchemaViewerRoutes() {
  return <Route index lazy={schemaViewerPage} />;
}
