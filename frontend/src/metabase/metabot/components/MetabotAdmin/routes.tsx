import { IndexRoute, Route } from "react-router";

import { PLUGIN_AI_CONTROLS } from "metabase/plugins";

import { MetabotAdminLayout } from "./MetabotAdminLayout";
import { MetabotConfig } from "./MetabotConfig";
import { MetabotSetup } from "./MetabotSetup";

export function getAdminRoutes() {
  return [
    <Route key="layout" component={MetabotAdminLayout}>
      <IndexRoute key="index" component={MetabotConfig} />
      <Route key="setup" path="setup" component={MetabotSetup} />
      <Route key="metabot" path=":metabotId" component={MetabotConfig} />
      {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
    </Route>,
  ];
}
