import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getSessionManagementRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("session-management")) {
    PLUGIN_MONITOR.isSessionManagementEnabled = true;
    PLUGIN_MONITOR.getSessionManagementRoutes = getSessionManagementRoutes;
  }
}
