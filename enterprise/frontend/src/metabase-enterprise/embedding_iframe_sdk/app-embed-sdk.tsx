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

  try {
    const root = createRoot(rootElement);

    root.render(
      <StrictMode>
        <SdkIframeEmbedRoute />
      </StrictMode>,
    );
  } catch (error) {
    console.error(error);
  }
}

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
