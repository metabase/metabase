import type { CustomVizPluginManifest } from "metabase-types/api";

/**
 * Direct access to a custom-viz dev server.
 *
 * Metabase does not proxy any of this: the dev server runs on the developer's own machine, so the browser
 * is the only thing that can reach it, and it fetches the bundle, manifest, icon and hot-reload stream
 * itself. That is why `dev_bundle_url` is validated to a loopback origin on the backend and added to the
 * app document's CSP `connect-src` for superusers — see
 * `metabase-enterprise.custom-viz-plugin.csp`.
 *
 * These requests deliberately use plain `fetch` rather than `api.fetch`: the API client resolves every URL
 * against `location.origin`, so it cannot issue a cross-origin request at all. No session credentials are
 * sent, which is correct — the dev server is not Metabase, and it already answers
 * `Access-Control-Allow-Origin: *`.
 */

const MANIFEST_PATH = "metabase-plugin.json";
const BUNDLE_PATH = "index.js";
const SSE_PATH = "__sse";

/** Strips a trailing slash so callers can join paths without doubling it. */
function devOrigin(devBundleUrl: string): string {
  return devBundleUrl.replace(/\/+$/, "");
}

export function getDevServerUrl(devBundleUrl: string, path: string): string {
  return `${devOrigin(devBundleUrl)}/${path}`;
}

export function getDevServerSseUrl(devBundleUrl: string): string {
  return getDevServerUrl(devBundleUrl, SSE_PATH);
}

/**
 * Never append a cache-busting query string.
 *
 * The CLI's dev server resolves a request straight onto the filesystem with the raw `req.url`, query string
 * and all, so `index.js?t=1` looks for a file of that literal name and 404s. `cache: "no-store"` is what
 * keeps a rebuild from being served stale: it bypasses the HTTP cache on the way out and stores nothing on
 * the way back, which is the whole point of the cache-bust anyway.
 */
async function fetchFromDevServer(url: string): Promise<Response> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Dev server responded ${res.status} for ${url}`);
  }
  return res;
}

/** The bundle source, to be evaluated inside the plugin sandbox. */
export async function fetchDevServerBundle(
  devBundleUrl: string,
): Promise<string> {
  const res = await fetchFromDevServer(
    getDevServerUrl(devBundleUrl, BUNDLE_PATH),
  );
  return res.text();
}

/**
 * The plugin manifest. Sent on to the backend, which validates it the same way it validates an uploaded
 * bundle's manifest.
 */
export async function fetchDevServerManifest(
  devBundleUrl: string,
): Promise<CustomVizPluginManifest> {
  const res = await fetchFromDevServer(
    getDevServerUrl(devBundleUrl, MANIFEST_PATH),
  );
  return res.json();
}
