/* eslint-disable import/order */
const start = new Date();

console.log("🚀 SDK Bootstrap: Starting...");

// Set the publicPath dynamically based on where this script was loaded from
// This ensures chunks load from the Metabase instance, not from the customer's app
const scriptUrl = document.currentScript?.src || "";
if (scriptUrl) {
  const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf("/") + 1);
  __webpack_public_path__ = baseUrl + "embedding-sdk/";
}

const authStart = new Date();
console.log("Auth code will run here");

console.log("⏳ SDK Bootstrap: Loading main bundle...");

// Lazy load the main bundle and dispatch a custom event when fully loaded
import(/* webpackChunkName: "sdk-main" */ "./main-bundle").then(() => {
  console.log("✅ SDK Bootstrap: Main bundle loaded!");
  console.log(
    "Time taken: to load main bundle",
    new Date().getTime() - authStart.getTime(),
    "ms",
  );

  // Dispatch event so the package knows the bundle is fully ready
  const event = new CustomEvent("metabase-sdk-bundle-loaded");
  document.dispatchEvent(event);
});
