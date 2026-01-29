import { PLUGIN_ENTITIES, PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { useGetTransformQuery } from "metabase-enterprise/api";
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
 * Initialize transforms plugin features.
 * Transforms are available:
 * - On self-hosted: always (no license required)
 * - On hosted: only with transforms add-on
 */
export function initializePlugin() {
  const isHosted = hasPremiumFeature("hosting");
  const hasTransformsFeature = hasPremiumFeature("transforms");
  const shouldEnable = !isHosted || hasTransformsFeature;

  if (shouldEnable) {
    PLUGIN_TRANSFORMS.isEnabled = true;
    PLUGIN_ENTITIES.entities["transforms"] = Transforms;
    PLUGIN_TRANSFORMS.canAccessTransforms = canAccessTransforms;
    PLUGIN_TRANSFORMS.getDataStudioTransformRoutes =
      getDataStudioTransformRoutes;
    PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
    PLUGIN_TRANSFORMS.useGetTransformQuery = useGetTransformQuery;
  }
}
