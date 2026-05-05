import { IndexRoute, Route } from "react-router";

import { PLUGIN_AI_CONTROLS, PLUGIN_AUDIT } from "metabase/plugins";

import { AISettingsPage } from "./AISettingsPage";
import { MetabotAdminLayout } from "./MetabotAdminLayout";

export function getMetabotAdminRoutes() {
  return [
    PLUGIN_AUDIT.getAiAnalyticsRoutes(),
    <Route
      key="layout"
      component={(props: any) => (
        <MetabotAdminLayout
          {...props}
          fullWidth={!PLUGIN_AI_CONTROLS.isEnabled}
          fullHeight={!PLUGIN_AI_CONTROLS.isEnabled}
        />
      )}
    >
      <IndexRoute key="index" component={AISettingsPage} />
      <Route key="metabot" path=":metabotId" component={AISettingsPage} />
      {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
    </Route>,
  ];
}
