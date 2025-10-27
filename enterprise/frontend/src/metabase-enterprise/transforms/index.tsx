import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformPicker } from "./components/TransformPicker";
import { getBenchNavItems, getBenchRoutes } from "./routes";

if (hasPremiumFeature("transforms")) {
  PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
  PLUGIN_TRANSFORMS.getBenchRoutes = getBenchRoutes;
  PLUGIN_TRANSFORMS.getBenchNavItems = getBenchNavItems;
}
