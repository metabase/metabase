/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { isWithinIframe } from "metabase/lib/dom";

import { SdkIframeEmbedRoute } from "./components/SdkIframeEmbedRoute";

function _init() {
  try {
    const root = createRoot(document.getElementById("root")!);

    root.render(
      <StrictMode>
        <SdkIframeEmbedRoute />
      </StrictMode>,
    );

    if (isWithinIframe()) {
      document.body.style.backgroundColor = "transparent";
    }
  } catch (error) {
    console.error(error);
  }
}

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
