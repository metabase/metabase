import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";

export function initializePlugin() {
  if (hasPremiumFeature("embedding_simple")) {
    PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled = () => true;
  }
}
