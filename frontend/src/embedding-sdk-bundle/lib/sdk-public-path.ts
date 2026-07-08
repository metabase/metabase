/**
 * Sets webpack's runtime `publicPath` (`__webpack_require__.p`) so that
 * on-demand chunks (created by dynamic `import()` — e.g. PDF/image export) are
 * fetched from the Metabase-hosted SDK asset directory rather than the host
 * application's origin.
 *
 * Without this, an on-demand chunk would be requested relative to the host
 * page's base URL (where the SDK chunks don't exist) and fail with a
 * `ChunkLoadError`. This is why those dependencies used to be force-imported
 * eagerly in `./sdk-specific-imports`.
 *
 * Both the chunked bootstrap and the legacy monolithic bundle are served from
 * `app/embedding-sdk.js`, with their split/on-demand chunks living one level
 * below at `app/embedding-sdk/chunks/`. The two delivery paths discover the
 * base differently:
 *
 *   - Chunked bundle: the bootstrap computes the base and exposes it on
 *     `window.METABASE_EMBEDDING_SDK_ASSET_BASE_URL` before loading chunks.
 *     `document.currentScript` is unreliable here because the entry executes
 *     asynchronously, after the chunk scripts have loaded.
 *   - Legacy monolithic bundle: loaded directly as a classic script, so
 *     `document.currentScript` is valid during this module's synchronous
 *     evaluation and we derive the base from it.
 *
 * This module must be imported before any dynamic `import()` can run (it is the
 * first import of the bundle entry), so the assignment lands before the first
 * `__webpack_require__.e` call.
 */

// Provided by webpack/rspack at build time; the `declare` emits no runtime code,
// so the assignment below is rewritten to set the runtime's `publicPath`.
declare let __webpack_public_path__: string;

const resolveAssetBaseUrl = (): string | undefined => {
  const fromGlobal =
    typeof window !== "undefined"
      ? window.METABASE_EMBEDDING_SDK_ASSET_BASE_URL
      : undefined;

  if (typeof fromGlobal === "string" && fromGlobal.length > 0) {
    return fromGlobal;
  }

  if (typeof document === "undefined") {
    return undefined;
  }

  const scriptUrl = (document.currentScript as HTMLScriptElement | null)?.src;

  if (!scriptUrl) {
    return undefined;
  }

  // e.g. ".../app/embedding-sdk.js" -> ".../app/embedding-sdk/"
  return new URL("embedding-sdk/", new URL("./", scriptUrl)).href;
};

const assetBaseUrl = resolveAssetBaseUrl();

if (assetBaseUrl) {
  __webpack_public_path__ = assetBaseUrl;
}

export {};
