import { createRoot } from "react-dom/client";

import { sdkBundleExports } from "embedding-sdk-bundle/sdk-bundle-exports";
import { isEmbeddedDataAppPath } from "embedding-sdk-shared/lib/data-app-embed";
import {
  EMBEDDING_SDK_CONFIG,
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG,
} from "metabase/embedding-sdk/config";
import { setDataApp } from "metabase/embedding/config";
import { applyDocumentLocales } from "metabase/utils/boot-locale";

import { DataAppIframeApp } from "./components/DataAppIframeApp/DataAppIframeApp";
import { readNameFromUrl } from "./lib/read-name-from-url";

/**
 * Entry point loaded by `data-app.html` and served from the internal or SSO-embedded data app route.
 *
 * This script boots inside the iframe — separate from the host Metabase
 * app's React tree. It reads the data-app `:name` from the URL, fetches the
 * bundle, instantiates it inside a Near Membrane sandbox bound to *this*
 * window, and renders the resulting component.
 */

// Register the full SDK bundle surface in-process (no separately-loaded
// `main.bundle.js` request) so everything the data-app sandbox endows resolves
// against it — the query primitives the package hooks dereference and the
// implementations the package component facades look up at render time.
window.METABASE_EMBEDDING_SDK_BUNDLE = sdkBundleExports;

const init = async () => {
  document.body.style.margin = "0";

  // This page is served from our own document, which carries the catalogues.
  await applyDocumentLocales();

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    console.error("no #root element on data-app iframe entry");
    return;
  }

  if (
    isEmbeddedDataAppPath({
      pathname: window.location.pathname,
      root: window.MetabaseRoot,
    })
  ) {
    EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding = true;
    EMBEDDING_SDK_CONFIG.enableEmbeddingSettingKey = "enable-embedding-modular";
    EMBEDDING_SDK_CONFIG.tokenFeatureKey = "embedding_simple";
    setDataApp(readNameFromUrl() ?? "");

    await import("sdk-iframe-embedding-ee-plugins");

    const { DataAppEmbed } =
      await import("./components/DataAppEmbed/DataAppEmbed");
    createRoot(rootElement).render(<DataAppEmbed />);
  } else {
    createRoot(rootElement).render(<DataAppIframeApp />);
  }
};

if (document.readyState !== "loading") {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
