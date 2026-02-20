import { Route } from "metabase/routing/compat/react-router-v3";

import { WritableConnectionInfoPage } from "./pages/WritableConnectionInfoPage";

export function getWritableConnectionInfoRoutes() {
  return (
    <Route
      path=":databaseId/write-data"
      component={WritableConnectionInfoPage}
    />
  );
}
