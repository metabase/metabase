import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getInspectorRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("transforms-python")) {
    PLUGIN_TRANSFORMS_PYTHON.getInspectorRoutes = getInspectorRoutes;
  }
}
