import React from "react";

import { Route } from "metabase/hoc/Title";
import { IndexRedirect } from "react-router";
import { t } from "ttag";
import ToolsApp from "./containers/ToolsApp";

const getRoutes = (store: any) => (
  <Route path="tools" title={t`Tools`} component={ToolsApp}>
    <IndexRedirect to="members" />
  </Route>
);

export default getRoutes;
