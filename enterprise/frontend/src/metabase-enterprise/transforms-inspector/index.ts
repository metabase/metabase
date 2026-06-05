import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getInspectorRoutes, getInspectorUpsellRoutes } from "./routes";

export function initializePlugin() {
  PLUGIN_TRANSFORMS_PYTHON.shouldShowInspectTab = true;
  PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes = getInspectorUpsellRoutes;
  if (hasPremiumFeature("transforms-python")) {
    PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes = getInspectorRoutes;
  }
}
