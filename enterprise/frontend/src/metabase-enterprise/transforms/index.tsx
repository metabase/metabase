import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export function initializePlugin() {
  // Only on cloud instances we need to check if the transforms feature is enabled
  if (hasPremiumFeature("hosting")) {
    PLUGIN_TRANSFORMS.isEnabled = !!hasPremiumFeature("transforms");
  }
}
