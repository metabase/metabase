import { createRoot } from "react-dom/client";

import {
  EMBEDDING_SDK_CONFIG,
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG,
} from "metabase/embedding-sdk/config";

// Enable SDK mode for new iframe embedding.
// Note that this is also defined in the SDK's entry point.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Use the iframe embedding auth flow instead of the regular auth flow.
EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSdkIframeEmbedAuth = true;

// load the embedding_iframe_sdk EE plugin
import "sdk-iframe-embedding-ee-plugins";

import { PLUGIN_EMBEDDING_IFRAME_SDK } from "./plugins";

function _init() {
  document.body.style.margin = "0";
  document.body.style.backgroundColor = "transparent";

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    console.error("no #root element found on sdk iframe embed route");
    return;
  }

  createRoot(rootElement).render(
    <PLUGIN_EMBEDDING_IFRAME_SDK.SdkIframeEmbedRoute />,
  );
}

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
