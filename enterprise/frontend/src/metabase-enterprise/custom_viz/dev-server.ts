import type { CustomVizPluginManifest } from "metabase-types/api";

const MANIFEST_PATH = "metabase-plugin.json";
const BUNDLE_PATH = "index.js";
const SSE_PATH = "__sse";

const TIMEOUT_MS = 5000;

export type DevServerErrorKind =
  /** Not an absolute http(s) URL, so it would have been fetched from Metabase's own origin. */
  | "invalid-url"
  /** Connection refused, DNS failure, blocked by CORS, or no answer within `TIMEOUT_MS`. */
  | "unreachable"
  /** Answered, but not with a 2xx — typically nothing is being served at that path. */
  | "not-ok"
  /** Answered 2xx with something that is not JSON, e.g. a dev server's index.html 404 fallback. */
  | "invalid-manifest";

export class DevServerError extends Error {
  constructor(
    readonly kind: DevServerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DevServerError";
  }
}

export function getDevServerUrl(devBundleUrl: string, path: string): string {
  return `${devBundleUrl.replace(/\/+$/, "")}/${path}`;
}

export function getDevServerSseUrl(devBundleUrl: string): string {
  return getDevServerUrl(devBundleUrl, SSE_PATH);
}

async function fetchFromDevServer(url: string): Promise<Response> {
  if (!/^https?:\/\//i.test(url)) {
    throw new DevServerError(
      "invalid-url",
      `Dev server URL must be absolute, got ${url}`,
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new DevServerError("unreachable", `Could not reach ${url}: ${error}`);
  }

  if (!response.ok) {
    throw new DevServerError(
      "not-ok",
      `Dev server responded ${response.status} for ${url}`,
    );
  }
  return response;
}

export async function fetchDevServerBundle(
  devBundleUrl: string,
): Promise<string> {
  const res = await fetchFromDevServer(
    getDevServerUrl(devBundleUrl, BUNDLE_PATH),
  );
  return res.text();
}

export async function fetchDevServerManifest(
  devBundleUrl: string,
): Promise<CustomVizPluginManifest> {
  const res = await fetchFromDevServer(
    getDevServerUrl(devBundleUrl, MANIFEST_PATH),
  );
  try {
    return await res.json();
  } catch (error) {
    throw new DevServerError(
      "invalid-manifest",
      `${getDevServerUrl(devBundleUrl, MANIFEST_PATH)} did not return JSON: ${error}`,
    );
  }
}
