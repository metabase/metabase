import { IndexRoute, Route } from "react-router";

import { PLUGIN_AI_CONTROLS } from "metabase/plugins";

import { AISettingsPage } from "./AISettingsPage";
import { MetabotAdminLayout } from "./MetabotAdminLayout";

export function getMetabotAdminRoutes() {
  return [
    <Route key="layout" component={MetabotAdminLayout}>
      <IndexRoute key="index" component={AISettingsPage} />
      <Route key="metabot" path=":metabotId" component={AISettingsPage} />
      {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
    </Route>,
  ];
}
