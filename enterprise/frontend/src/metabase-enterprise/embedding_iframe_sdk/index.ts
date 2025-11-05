import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SdkIframeEmbedRoute } from "./components/SdkIframeEmbedRoute";

// We allow users try out the iframe embedding without valid license on localhost.
// This should always be usable on an EE instance regardless of license.
PLUGIN_EMBEDDING_IFRAME_SDK.SdkIframeEmbedRoute = SdkIframeEmbedRoute;

if (hasPremiumFeature("embedding_simple")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.hasValidLicense = () => true;
}
