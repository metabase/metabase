// oxfmt-ignore
import { createRoot } from "react-dom/client";

// Setup CSP nonce for CodeMirror dynamic styles
// oxfmt-ignore
import "metabase/utils/csp";

// Import the embedding SDK vendors side-effects
// oxfmt-ignore
import "metabase/embedding-sdk/vendors-side-effects";
// oxfmt-ignore
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
// oxfmt-ignore
import "sdk-iframe-embedding-ee-plugins";

// Must be imported after the EE plugins are loaded
// oxfmt-ignore
import { SdkIframeEmbedRoute } from "metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute";

function _init() {
  document.body.style.margin = "0";
  document.body.style.backgroundColor = "transparent";
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.height = "100vh";

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
