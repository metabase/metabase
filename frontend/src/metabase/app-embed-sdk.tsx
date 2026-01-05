import { createRoot } from "react-dom/client";

// Setup CSP nonce for CodeMirror dynamic styles
import "metabase/lib/csp";

// Import the embedding SDK vendors side-effects
import "metabase/embedding-sdk/vendors-side-effects";
// eslint-disable-next-line import/order
import {
  EMBEDDING_SDK_CONFIG,
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG,
} from "metabase/embedding-sdk/config";

/**
 * Configuration overrides for simple embedding.
 */
EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = true;
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;
EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader = "embedding-simple";
EMBEDDING_SDK_CONFIG.enableEmbeddingSettingKey = "enable-embedding-simple";
EMBEDDING_SDK_CONFIG.tokenFeatureKey = "embedding_simple";

// load the embedding_iframe_sdk EE plugin
import "sdk-iframe-embedding-ee-plugins";

// Must be imported after the EE plugins are loaded
// eslint-disable-next-line import/order
import { SdkIframeEmbedRoute } from "metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute";

function _init() {
  document.body.style.margin = "0";
  document.body.style.backgroundColor = "transparent";

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    console.error("no #root element found on sdk iframe embed route");
    return;
  }

  createRoot(rootElement).render(<SdkIframeEmbedRoute />);
}

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
