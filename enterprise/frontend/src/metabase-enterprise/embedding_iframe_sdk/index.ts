import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("embedding_iframe_sdk")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled = () => true;
}
