import { defineGlobalEmbeddingSdk } from "embedding-sdk/lib/public/define-global-embedding-sdk";

export function initSdkBundle() {
  defineGlobalEmbeddingSdk();

  const ev = new CustomEvent("metabase-embedding-sdk-loaded", {
    bubbles: true,
    composed: true,
  });

  document.dispatchEvent(ev);
}
