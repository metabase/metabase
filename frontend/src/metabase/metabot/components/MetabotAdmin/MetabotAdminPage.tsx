import { IndexRoute, Route } from "react-router";

import { McpAppsSettings } from "./McpAppsSettings";
import { MetabotAdminLayout } from "./MetabotAdminLayout";
import { MetabotConfig } from "./MetabotConfig";
import { MetabotSetup } from "./MetabotSetup";

export function getAdminRoutes() {
  return [
    <Route key="layout" component={MetabotAdminLayout}>
      <IndexRoute key="index" component={MetabotConfig} />
      <Route key="setup" path="setup" component={MetabotSetup} />
      <Route key="mcp" path="mcp" component={McpAppsSettings} />,
      <Route key="metabot" path=":metabotId" component={MetabotConfig} />
    </Route>,
  ];
}
