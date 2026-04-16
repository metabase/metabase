import { IndexRoute, Route } from "react-router";

import { AISettingsPage } from "./AISettingsPage";
import { MetabotAdminLayout } from "./MetabotAdminLayout";

export function getAdminRoutes() {
  return [
    <Route key="layout" component={MetabotAdminLayout}>
      <IndexRoute key="index" component={AISettingsPage} />
      <Route key="metabot" path=":metabotId" component={AISettingsPage} />
    </Route>,
  ];
}
