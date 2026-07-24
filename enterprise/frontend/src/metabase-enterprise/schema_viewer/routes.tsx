import { Route } from "metabase/router";

import { SchemaViewerPage } from "./pages/SchemaViewerPage";

export function getDataStudioSchemaViewerRoutes() {
  return <Route index element={<SchemaViewerPage />} />;
}
