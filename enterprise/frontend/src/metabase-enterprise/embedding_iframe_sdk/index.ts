import { EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG } from "metabase/embedding-sdk/config";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SdkIframeEmbedRoute } from "./components/SdkIframeEmbedRoute";

// Use the iframe embedding auth flow instead of the regular auth flow.
EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSdkIframeEmbedAuth = true;

// We allow users try out the iframe embedding without valid license on localhost.
// This should always be usable on an EE instance regardless of license.
PLUGIN_EMBEDDING_IFRAME_SDK.SdkIframeEmbedRoute = SdkIframeEmbedRoute;

if (hasPremiumFeature("embedding_iframe_sdk")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.hasValidLicense = () => true;
}
