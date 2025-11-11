import { PLUGIN_ENTITIES, PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Transforms } from "metabase-enterprise/entities/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformPicker } from "./components/TransformPicker";
import { getDataStudioTransformRoutes } from "./routes";

if (hasPremiumFeature("transforms")) {
  PLUGIN_TRANSFORMS.isEnabled = true;
  PLUGIN_ENTITIES.entities["transforms"] = Transforms;
  PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;
  PLUGIN_TRANSFORMS.getDataStudioTransformRoutes = getDataStudioTransformRoutes;
  PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
}
