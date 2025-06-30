export function initSdkBundle() {
  const sdkLoadingEvent = new CustomEvent("metabase-embedding-sdk-loading", {
    bubbles: true,
    composed: true,
    detail: {
      status: "loaded",
    },
  });

  document.dispatchEvent(sdkLoadingEvent);
}
