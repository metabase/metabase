import { PLUGIN_DATA_TESTING } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  getActionTestRoutes,
  getMetricTestRoutes,
  getTransformTestRoutes,
} from "./routes";

export function initializePlugin() {
  if (hasPremiumFeature("transforms-testing")) {
    PLUGIN_DATA_TESTING.isEnabled = true;
    PLUGIN_DATA_TESTING.getTransformTestRoutes = getTransformTestRoutes;
    PLUGIN_DATA_TESTING.getMetricTestRoutes = getMetricTestRoutes;
    PLUGIN_DATA_TESTING.getActionTestRoutes = getActionTestRoutes;
  }
}
