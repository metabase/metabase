import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformPicker } from "./components/TransformPicker";
import { getTransformNavItems, getTransformRoutes } from "./routes";

if (hasPremiumFeature("transforms")) {
  PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
  PLUGIN_TRANSFORMS.getTransformRoutes = getTransformRoutes;
  PLUGIN_TRANSFORMS.getTransformNavItems = getTransformNavItems;
}
