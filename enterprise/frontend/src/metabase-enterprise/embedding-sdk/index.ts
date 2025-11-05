import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("embedding_sdk")) {
  PLUGIN_EMBEDDING_SDK.isEnabled = () => true;
}
