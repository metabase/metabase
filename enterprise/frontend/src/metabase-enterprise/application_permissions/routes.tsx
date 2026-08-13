import { Route } from "metabase/router";

import ApplicationPermissionsPage from "./pages/ApplicationPermissionsPage";

const getRoutes = () => (
  <Route path="application" element={<ApplicationPermissionsPage />} />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
