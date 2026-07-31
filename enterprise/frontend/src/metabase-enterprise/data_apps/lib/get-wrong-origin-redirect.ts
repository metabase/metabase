const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True for loopback hostnames — `localhost`, any `*.localhost`, and IP loopbacks. */
function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * In cross-origin mode the data-app page must run on the `site-url` origin — the
 * iframe's `frame-ancestors` and the broker handshake are pinned there. Locally the
 * instance answers to several loopback hostnames (`localhost` vs the configured
 * `mb.localhost`), so a link, bookmark, or typed URL can land on the wrong one and
 * the frame silently fails to load. Returns the URL to bounce to, or null to stay.
 *
 * Scoped to loopback hosts on purpose: production has one canonical origin (so this
 * never triggers), and an operator may deliberately serve the main app under several
 * hostnames — we must not yank real users to `site-url` there.
 */
export function getWrongOriginRedirect(
  isCrossOrigin: boolean,
  siteUrl: string | null,
  location: Pick<
    Location,
    "origin" | "hostname" | "pathname" | "search" | "hash"
  >,
): string | null {
  if (!isCrossOrigin || !siteUrl) {
    return null;
  }

  let siteOrigin: string;
  try {
    siteOrigin = new URL(siteUrl).origin;
  } catch {
    return null;
  }

  if (location.origin === siteOrigin || !isLoopbackHost(location.hostname)) {
    return null;
  }

  return siteOrigin + location.pathname + location.search + location.hash;
}
