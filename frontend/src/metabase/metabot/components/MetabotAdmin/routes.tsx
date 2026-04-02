import { IndexRoute, Route } from "react-router";

import { PLUGIN_AI_CONTROLS, PLUGIN_AUDIT } from "metabase/plugins";

import { McpAppsSettings } from "./McpAppsSettings";
import { MetabotAdminLayout } from "./MetabotAdminLayout";
import { MetabotConfig } from "./MetabotConfig";
import { MetabotSetup } from "./MetabotSetup";

export function getMetabotAdminRoutes() {
  return [
    PLUGIN_AUDIT.getMetabotAnalyticsRoutes(),
    <Route key="layout" component={MetabotAdminLayout}>
      <IndexRoute key="index" component={MetabotConfig} />
      <Route key="setup" path="setup" component={MetabotSetup} />
      <Route key="mcp" path="mcp" component={McpAppsSettings} />,
      {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
      <Route key="metabot" path=":metabotId" component={MetabotConfig} />
    </Route>,
  ];
}
