import { Route, withRouteProps } from "metabase/router";

import { WritableConnectionInfoPage } from "./pages/WritableConnectionInfoPage";

const RoutedWritableConnectionInfoPage = withRouteProps(
  WritableConnectionInfoPage,
);

export function getWritableConnectionInfoRoutes() {
  return (
    <Route
      path=":databaseId/write-data"
      element={<RoutedWritableConnectionInfoPage />}
    />
  );
}
