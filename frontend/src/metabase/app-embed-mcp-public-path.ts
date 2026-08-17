/**
 * Sets webpack's runtime `publicPath` (`__webpack_require__.p`) so on-demand
 * chunks (loaded via dynamic `import()` — e.g. the leaflet map renderer and the
 * echarts renderer) are fetched from the Metabase instance.
 *
 * The MCP app runs inside a sandboxed `about:srcdoc` iframe. The initial bundle
 * scripts load fine because HtmlWebpackPlugin writes them with an absolute,
 * instance-templated URL. On-demand chunks instead use the runtime `publicPath`,
 * which is the relative `output.publicPath` ("app/dist/"); that does not resolve
 * to the instance inside the srcdoc iframe and 404s.
 *
 * Unlike the Embedding SDK (which derives its base from `document.currentScript`),
 * the instance URL is injected synchronously via `window.metabaseConfig`, so we
 * use it directly — `document.currentScript` is null here because the entry runs
 * deferred, after the document is parsed.
 *
 * This must be imported before any dynamic `import()` can run, so it is the first
 * import of the bundle entry.
 */

// Provided by webpack/rspack at build time; the `declare` emits no runtime code,
// so the assignment below is rewritten to set the runtime's `publicPath`.
declare let __webpack_public_path__: string;

const instanceUrl: string = window.metabaseConfig?.instanceUrl ?? "";

// In hot/dev mode `output.publicPath` is already an absolute localhost URL served
// by the dev server, so leave it alone — only the relative production path needs
// to be rewritten to the instance.
const runtimePathIsAbsolute = /^https?:\/\//.test(__webpack_public_path__);

if (instanceUrl && !runtimePathIsAbsolute) {
  const base = instanceUrl.endsWith("/") ? instanceUrl : `${instanceUrl}/`;
  __webpack_public_path__ = `${base}app/dist/`;
}

export {};
