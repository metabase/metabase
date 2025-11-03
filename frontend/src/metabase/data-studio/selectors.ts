import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import type { State } from "metabase-types/store";

export function canAccessDataStudio(state: State) {
  return (
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state) ||
    PLUGIN_TRANSFORMS.canAccessTransforms(state)
  );
}
