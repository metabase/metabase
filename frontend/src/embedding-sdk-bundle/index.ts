import { waitForAuthConfigAndStart } from "./bootstrap-auth";

const start = new Date();
(window as any).log = (message: string, ...args: any[]) =>
  console.log(
    `${message} after ${new Date().getTime() - start.getTime()} ms`,
    ...args,
  );

console.log("🚀 SDK Bootstrap: Starting...");

// Set the publicPath dynamically based on where this script was loaded from
// This ensures chunks load from the Metabase instance, not from the customer's app
const scriptUrl = document.currentScript?.src || "";
if (scriptUrl) {
  const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf("/") + 1);
  __webpack_public_path__ = baseUrl + "embedding-sdk/";
}

const startTime = new Date();
console.log("⏳ SDK Bootstrap: Starting early auth...");

// Start auth as soon as we have the auth config from the provider props store
// Import directly (not dynamic) so it's included in the bootstrap chunk

waitForAuthConfigAndStart({ startTime });

console.log(
  "✅ SDK Bootstrap: Early auth watcher started after",
  new Date().getTime() - startTime.getTime(),
  "ms",
);

console.log(
  "⏳ SDK Bootstrap: Loading main bundle after",
  new Date().getTime() - startTime.getTime(),
  "ms",
);

// Lazy load the main bundle and dispatch a custom event when fully loaded
import(/* webpackChunkName: "sdk-main" */ "./main-bundle").then(() => {
  console.log(
    "✅ SDK Bootstrap: Main bundle loaded after",
    new Date().getTime() - startTime.getTime(),
    "ms",
  );

  // Dispatch event so the package knows the bundle is fully ready
  const event = new CustomEvent("metabase-sdk-bundle-loaded");
  document.dispatchEvent(event);
});
