import { PLUGIN_ENTITIES, PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { transformApi, useGetTransformQuery } from "metabase-enterprise/api";
import { Transforms } from "metabase-enterprise/entities/transforms";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { State } from "metabase-types/store";

import { getDataStudioTransformRoutes } from "./routes";
import { getRootCollectionItem } from "./utils";

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
    PLUGIN_TRANSFORMS.useGetTransformQuery = useGetTransformQuery;
    PLUGIN_TRANSFORMS.getRootCollectionItem = getRootCollectionItem;
    // @ts-expect-error - FIXME: this is a nightmare to type, and it's moving to OSS anyway
    PLUGIN_TRANSFORMS.transformApi = transformApi;
  }
}
