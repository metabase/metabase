import { PLUGIN_MONITOR } from "metabase/plugins";

import { getDependencyDiagnosticsRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_MONITOR.getDependencyDiagnosticsRoutes =
    getDependencyDiagnosticsRoutes;
}
