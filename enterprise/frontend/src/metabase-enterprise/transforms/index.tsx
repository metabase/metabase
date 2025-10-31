import { PLUGIN_ENTITIES, PLUGIN_TRANSFORMS } from "metabase/plugins";
import { Transforms } from "metabase-enterprise/entities/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformPicker } from "./components/TransformPicker";
import { getBenchRoutes } from "./routes";

if (hasPremiumFeature("transforms")) {
  PLUGIN_ENTITIES.entities["transforms"] = Transforms;
  PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
  PLUGIN_TRANSFORMS.getBenchRoutes = getBenchRoutes;
}
