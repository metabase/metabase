import { waitForAuthConfigAndStartEarlyAuthFlow } from "./bootstrap-auth";

// Bootstrap entry point for the SDK bundle.
//
// On disk:   `app/embedding-sdk/chunks/embedding-sdk.js`
// Served at: `app/embedding-sdk.js?packageVersion={version}` unless `useLegacyMonolithicBundle=true` is also passed
//
// At build time, the inject-bundle-manifest rspack plugin:
//   1. Replaces "__SDK_CHUNK_MANIFEST__" with the list of split chunk paths
//   2. Appends the rspack runtime at the end of this file
//
// Because the runtime is already inlined, __webpack_require__ is available
// when this script executes. The split chunks register themselves into
// the module system as they load.

// Start auth in parallel with chunk loading
waitForAuthConfigAndStartEarlyAuthFlow();

// Replaced at build time with { chunks: ["embedding-sdk/chunks/...js", ...] }
// Paths are relative to /app/ (the baseUrl derived from document.currentScript.src)
const manifest: { chunks: string[] } = "__SDK_CHUNK_MANIFEST__" as any;

const scriptUrl =
  (document.currentScript as HTMLScriptElement | null)?.src || "";
const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf("/") + 1);

function loadScript(filename: string): Promise<string> {
  const url = `${baseUrl}${filename}`;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = url;
    script.addEventListener("load", () => resolve(url));
    script.addEventListener("error", () =>
      reject(new Error(`Failed to load ${filename}`)),
    );
    document.head.appendChild(script);
  });
}

void Promise.all(manifest.chunks.map((filename) => loadScript(filename))).catch(
  (error) => {
    console.error("SDK Bootstrap: Failed to load bundle chunks:", error);
    document.dispatchEvent(new CustomEvent("metabase-sdk-bundle-error"));
  },
);
