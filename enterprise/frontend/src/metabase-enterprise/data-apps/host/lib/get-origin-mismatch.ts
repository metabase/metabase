const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

export type OriginMismatch =
  /** Move the page to `url`: a local instance answers on several loopback names. */
  | { kind: "redirect"; url: string }
  /** Show an error that links to `url`: an instance may answer on several host names on purpose. */
  | { kind: "wrong-origin"; url: string };

/**
 * In cross-origin mode only the site URL's origin may frame a data app. Returns what to
 * do when this page is on another origin, with `url` the same page on the site URL's
 * origin, or null when nothing is wrong.
 */
export function getOriginMismatch(
  isCrossOrigin: boolean,
  siteUrl: string | null,
  location: Pick<
    Location,
    "origin" | "hostname" | "pathname" | "search" | "hash"
  >,
): OriginMismatch | null {
  if (!isCrossOrigin || !siteUrl) {
    return null;
  }

  let siteOrigin: string;
  try {
    siteOrigin = new URL(siteUrl).origin;
  } catch {
    return null;
  }

  if (location.origin === siteOrigin) {
    return null;
  }

  const url = siteOrigin + location.pathname + location.search + location.hash;

  return isLoopbackHost(location.hostname)
    ? { kind: "redirect", url }
    : { kind: "wrong-origin", url };
}
