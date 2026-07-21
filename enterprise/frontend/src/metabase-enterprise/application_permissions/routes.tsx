import { Route, withRouteProps } from "metabase/router";

import ApplicationPermissionsPage from "./pages/ApplicationPermissionsPage";

const RoutedApplicationPermissionsPage = withRouteProps(
  ApplicationPermissionsPage,
);

const getRoutes = () => (
  <Route path="application" element={<RoutedApplicationPermissionsPage />} />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
