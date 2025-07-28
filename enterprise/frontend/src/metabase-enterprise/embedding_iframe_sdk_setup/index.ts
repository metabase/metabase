import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SdkIframeEmbedSetup } from "./components/SdkIframeEmbedSetup";

// Feature gate the embed setup for gradual rollouts.
// In the future, we may drop this to enable users to try out new iframe embedding.
if (hasPremiumFeature("embedding_iframe_sdk")) {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled = () => true;
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.shouldShowEmbedInNewItemMenu = () => true;
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.SdkIframeEmbedSetup = SdkIframeEmbedSetup;
}
