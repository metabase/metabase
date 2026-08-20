import { t } from "ttag";

/**
 * Hostnames naming the machine the browser runs on.
 *
 * The browser is what fetches a dev bundle, so a dev server is always local. The backend enforces the same
 * set (`metabase-enterprise.custom-viz-plugin.cache/loopback-hosts`) and stays authoritative; this only
 * exists so the developer gets the error while typing rather than after a round trip.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Why the URL is unusable, or null when it is fine. Mirrors the backend's messages so the two agree.
 */
export function getDevUrlError(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return t`Enter a valid URL, for example http://localhost:5174`;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return t`Dev server URL must use http or https.`;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) {
    // host.docker.internal used to be the documented answer for Metabase-in-Docker, back when the server
    // did the fetching. It resolves inside the container only, so now that the browser fetches, it cannot
    // work — and no longer needs to.
    if (hostname === "host.docker.internal") {
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- dev-mode-only, admin-only message naming the Docker image a developer runs, not the whitelabelled app.
      return t`Dev server URL must point at localhost. Use http://localhost:5174 instead: your browser loads the plugin directly, so it reaches a dev server on your own machine even when Metabase runs in Docker.`;
    }
    return t`Dev server URL must point at localhost, for example http://localhost:5174`;
  }

  if (
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    return t`Dev server URL must be a bare origin like http://localhost:5174, with no path or query.`;
  }

  return null;
}
