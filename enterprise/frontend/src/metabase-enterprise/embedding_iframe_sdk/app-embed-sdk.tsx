import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SdkIframeEmbedRoute } from "./components/SdkIframeEmbedRoute";

function _init() {
  document.body.style.margin = "0";
  document.body.style.backgroundColor = "transparent";

  const rootElement = document.getElementById("root");

  if (!rootElement) {
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <SdkIframeEmbedRoute />
    </StrictMode>,
  );
}

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
