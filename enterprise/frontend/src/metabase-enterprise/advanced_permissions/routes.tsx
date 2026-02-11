import { Route } from "react-router";

import { WriteDataConnectionPage } from "./pages/WriteDataConnectionPage";

export function getWriteDataConnectionRoutes() {
  return (
    <Route
      path=":databaseId/writable-connection"
      component={WriteDataConnectionPage}
    />
  );
}
