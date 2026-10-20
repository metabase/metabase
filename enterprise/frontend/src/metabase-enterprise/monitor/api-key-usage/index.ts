import { PLUGIN_MONITOR } from "metabase/plugins";

import { getApiKeyUsageRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_MONITOR.getApiKeyUsageRoutes = getApiKeyUsageRoutes;
}
