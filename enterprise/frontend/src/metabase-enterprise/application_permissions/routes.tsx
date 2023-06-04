import { Route } from "metabase/hoc/Title";

import ApplicationPermissionsPage from "./pages/ApplicationPermissionsPage";

const getRoutes = () => (
  <Route path="application" component={ApplicationPermissionsPage} />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
