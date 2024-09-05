import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

// TODO: Change this to `embedding-sdk` once the flag is added
if (hasPremiumFeature("embedding-sdk")) {
  PLUGIN_EMBEDDING_SDK.isEnabled = () => true;
}
