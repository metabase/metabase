import { createRoot } from "react-dom/client";

import api from "metabase/api/legacy-client";
import { DataAppIframeApp } from "metabase/data_apps/DataAppIframeApp";
import registerVisualizations from "metabase/visualizations/register";

/**
 * Entry point loaded by `data-app.html` and served from `/embed/data-app/:name`.
 *
 * This script boots inside the iframe — separate from the host Metabase
 * app's React tree. It reads the data-app `:name` from the URL, fetches the
 * bundle, instantiates it inside a Near Membrane sandbox bound to *this*
 * window, and renders the resulting component.
 *
 * No `MetabaseProvider`/Redux/Router scaffolding is bundled at the iframe
 * top level — the data-app bundle is expected to wrap itself in the
 * `MetabaseProvider` endowment, which sets up the SDK Redux store and
 * theme on demand.
 */

api.basename = (window.MetabaseRoot ?? "").replace(/\/+$/, "");

function _init() {
  document.body.style.margin = "0";

  registerVisualizations();

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
