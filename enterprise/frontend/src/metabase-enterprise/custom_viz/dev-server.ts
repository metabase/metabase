import type { CustomVizPluginManifest } from "metabase-types/api";

/**
 * Direct browser access to a custom-viz dev server running on the developer's own machine — Metabase
 * proxies none of it. `dev_bundle_url` is validated to a loopback origin on the backend and added to the
 * app document's CSP `connect-src` for superusers, see `metabase-enterprise.custom-viz-plugin.csp`.
 *
 * Uses plain `fetch` rather than `api.fetch`, which resolves URLs against `location.origin` and so cannot
 * go cross-origin. No session credentials are sent; the dev server answers `Access-Control-Allow-Origin: *`.
 */

const MANIFEST_PATH = "metabase-plugin.json";
const BUNDLE_PATH = "index.js";
const SSE_PATH = "__sse";

export function getDevServerUrl(devBundleUrl: string, path: string): string {
  return `${devBundleUrl.replace(/\/+$/, "")}/${path}`;
}

export function getDevServerSseUrl(devBundleUrl: string): string {
  return getDevServerUrl(devBundleUrl, SSE_PATH);
}

/**
 * No cache-busting query string: the CLI dev server resolves the raw `req.url` onto the filesystem, so
 * `index.js?t=1` 404s. `cache: "no-store"` is what keeps rebuilds from being served stale.
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

/** The manifest, sent on to the backend which validates it like an uploaded bundle's. */
export async function fetchDevServerManifest(
  devBundleUrl: string,
): Promise<CustomVizPluginManifest> {
  const res = await fetchFromDevServer(
    getDevServerUrl(devBundleUrl, MANIFEST_PATH),
  );
  return res.json();
}
