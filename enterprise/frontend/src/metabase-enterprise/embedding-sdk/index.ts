import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

/**
 * Initialize embedding SDK plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("embedding_sdk")) {
    PLUGIN_EMBEDDING_SDK.isEnabled = () => true;
  }
}
