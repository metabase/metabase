import { createRoot } from "react-dom/client";

import { sdkBundleExports } from "embedding-sdk-bundle/sdk-bundle-exports";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { DataAppIframeApp } from "./DataAppIframeApp";

/**
 * Entry point loaded by `data-app.html` and served from `/embed/apps/:name`.
 *
 * This script boots inside the iframe — separate from the host Metabase
 * app's React tree. It reads the data-app `:name` from the URL, fetches the
 * bundle, instantiates it inside a Near Membrane sandbox bound to *this*
 * window, and renders the resulting component.
 */

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Register the full SDK bundle surface in-process (no separately-loaded
// `main.bundle.js` request) so everything the data-app sandbox endows resolves
// against it — the query primitives the package hooks dereference and the
// implementations the package component facades look up at render time.
window.METABASE_EMBEDDING_SDK_BUNDLE = sdkBundleExports;

function _init() {
  document.body.style.margin = "0";

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    console.error("no #root element on data-app iframe entry");
    return;
  }

  createRoot(rootElement).render(<DataAppIframeApp />);
}

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
