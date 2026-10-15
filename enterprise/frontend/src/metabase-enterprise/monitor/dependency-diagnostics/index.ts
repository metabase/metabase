import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getDependencyDiagnosticsRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_MONITOR.isDependencyDiagnosticsEnabled = true;
    PLUGIN_MONITOR.getDependencyDiagnosticsRoutes =
      getDependencyDiagnosticsRoutes;
  }
}
