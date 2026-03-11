import { Route } from "react-router";

import { WritableConnectionInfoPage } from "./pages/WritableConnectionInfoPage";

export function getWritableConnectionInfoRoutes() {
  return (
    <Route
      path=":databaseId/write-data"
      component={WritableConnectionInfoPage}
    />
  );
}
