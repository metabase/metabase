import { Route } from "react-router";

import ApplicationPermissionsPage from "metabase/admin/permissions/pages/ApplicationPermissionsPage";

const getRoutes = () => (
  <Route path="application" component={ApplicationPermissionsPage} />
);

// eslint-disable-next-line import/no-default-export
export default getRoutes;
