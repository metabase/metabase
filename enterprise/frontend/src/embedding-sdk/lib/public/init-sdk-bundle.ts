import { defineGlobalEmbeddingSdk } from "embedding-sdk/lib/public/define-global-embedding-sdk";

export function initSdkBundle() {
  defineGlobalEmbeddingSdk();

  const sdkLoadingEvent = new CustomEvent("metabase-embedding-sdk-loading", {
    bubbles: true,
    composed: true,
    detail: {
      status: "loaded",
    },
  });

  document.dispatchEvent(sdkLoadingEvent);
}
