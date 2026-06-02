import { IndexRoute } from "react-router";

import { SchemaViewerPage } from "./pages/SchemaViewerPage";

export function getDataStudioSchemaViewerRoutes() {
  return <IndexRoute component={SchemaViewerPage} />;
}
