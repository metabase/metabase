import { IndexRoute } from "metabase/router";

import { SchemaViewerPage } from "./pages/SchemaViewerPage";

export function getDataStudioSchemaViewerRoutes() {
  return <IndexRoute component={SchemaViewerPage} />;
}
