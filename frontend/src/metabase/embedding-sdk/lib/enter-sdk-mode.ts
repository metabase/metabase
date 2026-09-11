import { handleLinkSdkPlugin } from "embedding-sdk-shared/lib/sdk-global-plugins";
import { type OnBeforeRequestHandler, PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { PLUGIN_HOST_NAVIGATION } from "metabase/urls";

// The SDK and its derivatives identify themselves with the `X-Metabase-Client` header,
// so they leave `X-Metabase-Embedded` off even when the page they run on is inside an iframe.
const skipEmbeddedHeader: OnBeforeRequestHandler = async () => {};

export function enterSdkMode() {
  EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
  PLUGIN_HOST_NAVIGATION.host = {
    sameOriginTarget: "_blank",
    handleLink: async (url) => {
      const { handled } = await handleLinkSdkPlugin(url);
      return handled;
    },
  };
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader = skipEmbeddedHeader;
}
