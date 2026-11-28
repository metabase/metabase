import "@metabase/ui/styles.css";
import "@metabase/ui/fonts.css";
import { setNonce } from "get-nonce";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const nonce = new URLSearchParams(window.location.search).get("nonce");
if (nonce) {
  setNonce(nonce);
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
