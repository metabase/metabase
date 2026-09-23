import { PLUGIN_MONITOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getRelatedQuestionsRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("semantic_search")) {
    PLUGIN_MONITOR.isRelatedQuestionsEnabled = true;
    PLUGIN_MONITOR.getRelatedQuestionsRoutes = getRelatedQuestionsRoutes;
  }
}
