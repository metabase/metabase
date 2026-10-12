import { PLUGIN_MONITOR } from "metabase/plugins";

import { getContentDiagnosticsRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_MONITOR.getContentDiagnosticsRoutes = getContentDiagnosticsRoutes;
}
