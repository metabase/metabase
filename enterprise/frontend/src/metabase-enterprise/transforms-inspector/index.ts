import { PLUGIN_TRANSFORMS_INSPECTOR } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getInspectorRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("transforms-basic")) {
    PLUGIN_TRANSFORMS_INSPECTOR.isEnabled = true;
    PLUGIN_TRANSFORMS_INSPECTOR.getInspectorRoutes = getInspectorRoutes;
  }
}
