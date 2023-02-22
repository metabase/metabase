import React from "react";

import { Route } from "metabase/hoc/Title";

import ApplicationPermissionsPage from "./pages/ApplicationPermissionsPage";

const getRoutes = () => (
  <Route path="application" component={ApplicationPermissionsPage} />
);

export default getRoutes;
