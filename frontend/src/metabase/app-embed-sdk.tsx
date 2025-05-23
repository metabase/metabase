import { createRoot } from "react-dom/client";

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
