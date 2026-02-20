import { Route } from "metabase/routing/compat/react-router-v3";

import ApplicationPermissionsPage from "./pages/ApplicationPermissionsPage";

const getRoutes = () => (
  <Route path="application" component={ApplicationPermissionsPage} />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
