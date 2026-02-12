import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getReplaceDataSourceRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_REPLACEMENT.getReplaceDataSourceRoutes = getReplaceDataSourceRoutes;
  }
}
