import { PLUGIN_ENTITIES, PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { Transforms } from "metabase-enterprise/entities/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { TransformPicker } from "./components/TransformPicker";
import { getDataStudioTransformRoutes } from "./routes";

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
    PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;
    PLUGIN_TRANSFORMS.getDataStudioTransformRoutes =
      getDataStudioTransformRoutes;
    PLUGIN_TRANSFORMS.TransformPicker = TransformPicker;
    PLUGIN_TRANSFORMS.useGetTransformQuery = useGetTransformQuery;
  }
}
