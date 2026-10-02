import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getOAuthClientManagementRoutes } from "./routes";

export function initializePlugin() {
  // The sessions kill switch and the clients kill switch ship and license together
  if (hasPremiumFeature("session-management")) {
    PLUGIN_MONITOR.isOAuthClientManagementEnabled = true;
    PLUGIN_MONITOR.getOAuthClientManagementRoutes =
      getOAuthClientManagementRoutes;
  }
}
