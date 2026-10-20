import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getOAuthClientManagementRoutes } from "./routes";

export function initializePlugin() {
  // OAuth clients ship and license with session management
  if (hasPremiumFeature("session-management")) {
    PLUGIN_MONITOR.isOAuthClientManagementEnabled = true;
    PLUGIN_MONITOR.getOAuthClientManagementRoutes =
      getOAuthClientManagementRoutes;
  }
}
