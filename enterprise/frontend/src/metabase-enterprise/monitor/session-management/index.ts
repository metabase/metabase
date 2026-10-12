import { PLUGIN_MONITOR } from "metabase/plugins";

import { sessionManagementCatchAllPage, sessionManagementPage } from "./routes";

export function initializePlugin() {
  PLUGIN_MONITOR.sessionsPage = sessionManagementPage;
  PLUGIN_MONITOR.sessionsCatchAllPage = sessionManagementCatchAllPage;
}
