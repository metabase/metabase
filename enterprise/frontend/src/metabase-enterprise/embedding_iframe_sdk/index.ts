import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import { isInteractiveEmbeddingEnabled } from "metabase-enterprise/embedding/selectors";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SdkInteractiveEmbedRoute } from "./components/SdkInteractiveEmbedRoute";

if (hasPremiumFeature("embedding_iframe_sdk")) {
  PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled = () => true;

  // TODO: make this a separate setting once we have the new embed flow
  PLUGIN_EMBEDDING_IFRAME_SDK.isInteractiveEmbeddingEnabled =
    isInteractiveEmbeddingEnabled;

  PLUGIN_EMBEDDING_IFRAME_SDK.InteractiveEmbedRoute = SdkInteractiveEmbedRoute;
}
