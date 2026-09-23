import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getSemanticDuplicatesRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("semantic_search")) {
    PLUGIN_MONITOR.isSemanticDuplicatesEnabled = true;
    PLUGIN_MONITOR.getSemanticDuplicatesRoutes = getSemanticDuplicatesRoutes;
  }
}
