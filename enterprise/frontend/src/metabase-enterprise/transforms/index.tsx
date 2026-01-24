import { PLUGIN_ENTITIES, PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Transforms } from "metabase-enterprise/entities/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { State } from "metabase-types/store";

import { TransformPicker } from "./components/TransformPicker";
import { getDataStudioTransformRoutes } from "./routes";

const canAccessTransforms = (state: State): boolean => {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_access_transforms ?? false;
};

/**
 * Initialize transforms plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("transforms")) {
    // Keep only isEnabled — we will need it to enforce disabling transforms on hosted instances without an add-on
    PLUGIN_TRANSFORMS.isEnabled = true;

    // TODO: remove once fully moved to OSS
    PLUGIN_ENTITIES.entities["transforms"] = Transforms;
    PLUGIN_TRANSFORMS.canAccessTransforms = canAccessTransforms;
    PLUGIN_TRANSFORMS.getDataStudioTransformRoutes =
      getDataStudioTransformRoutes;
    PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
  }
}
