import React from "react";

import { Route } from "metabase/hoc/Title";

import GeneralPermissionsPage from "./pages/GeneralPermissionsPage";

const getRoutes = () => (
  <Route path="general" component={GeneralPermissionsPage} />
);

export default getRoutes;
