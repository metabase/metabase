import { Route } from "metabase/router";

import { WritableConnectionInfoPage } from "./pages/WritableConnectionInfoPage";

export function getWritableConnectionInfoRoutes() {
  return (
    <Route
      path=":databaseId/write-data"
      element={<WritableConnectionInfoPage />}
    />
  );
}
