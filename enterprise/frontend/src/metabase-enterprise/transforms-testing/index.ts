import { PLUGIN_TRANSFORMS_TESTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getTransformTestRoutes } from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("transforms-testing")) {
    PLUGIN_TRANSFORMS_TESTING.isEnabled = true;
    PLUGIN_TRANSFORMS_TESTING.getTransformTestRoutes = getTransformTestRoutes;
  }
}
