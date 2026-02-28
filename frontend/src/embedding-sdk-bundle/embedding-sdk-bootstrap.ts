import { waitForAuthConfigAndStart } from "./bootstrap-auth";

// This is the bootstrap entry point (embedding-sdk-bootstrap.js).
// It's tiny — just starts auth early and loads the bundle chunks in parallel.
// Old NPM packages load embedding-sdk.js directly (backward compat).

// New NPM packages load this bootstrap instead. It loads multiple chunks:
//   1. The runtime chunk (tiny, must load first — sets up module system)
//   2. All split chunks + the entry chunk (loaded in parallel after runtime)
// The chunk manifest is injected at build time by the rspack plugin.

// Start auth as soon as we have the auth config from the provider props store
waitForAuthConfigAndStart();

// Chunk manifest is injected at build time by the inject-bundle-manifest plugin.
// The runtime chunk is inlined into this bootstrap file by the build plugin,
// so the manifest only contains the split chunks to load in parallel.
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

// The runtime chunk is inlined at the end of this file by the build plugin,
// so __webpack_require__ is already available. Load all split chunks in parallel.
void Promise.all(manifest.chunks.map((filename) => loadScript(filename))).catch(
  (error) => {
    console.error("SDK Bootstrap: Failed to load bundle chunks:", error);
    document.dispatchEvent(new CustomEvent("metabase-sdk-bundle-error"));
  },
);
