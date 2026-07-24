import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getContentDiagnosticsRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("content_diagnostics")) {
    PLUGIN_MONITOR.isContentDiagnosticsEnabled = true;
    PLUGIN_MONITOR.getContentDiagnosticsRoutes = getContentDiagnosticsRoutes;
  }
}
