import { PLUGIN_MONITOR } from "metabase/plugins";

import { getSessionsRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_MONITOR.getSessionsRoutes = getSessionsRoutes;
}
