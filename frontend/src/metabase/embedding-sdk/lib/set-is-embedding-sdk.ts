import { type OnBeforeRequestHandler, PLUGIN_API } from "metabase/api/client";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// The SDK and its derivatives identify themselves with the `X-Metabase-Client` header,
// so they leave `X-Metabase-Embedded` off even when the page they run on is inside an iframe.
const skipEmbeddedHeader: OnBeforeRequestHandler = async () => {};

export function setIsEmbeddingSdk() {
  EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader = skipEmbeddedHeader;
}
