import { Route, withRouteProps } from "metabase/router";

import { SchemaViewerPage } from "./pages/SchemaViewerPage";

const RoutedSchemaViewerPage = withRouteProps(SchemaViewerPage);

export function getDataStudioSchemaViewerRoutes() {
  return <Route index element={<RoutedSchemaViewerPage />} />;
}
