import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

const schemaViewerPage = () =>
  import("./pages/SchemaViewerPage").then(({ SchemaViewerPage }) => ({
    Component: SchemaViewerPage,
  }));

registerPagePrefetch(Urls.dataStudioSchemaViewer(), schemaViewerPage);

export function getDataStudioSchemaViewerRoutes() {
  return <Route index lazy={schemaViewerPage} />;
}
