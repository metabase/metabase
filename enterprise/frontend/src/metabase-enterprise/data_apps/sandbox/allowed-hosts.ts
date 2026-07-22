/**
 * Per-app fetch/XHR allowlist for the data-app Near-Membrane sandbox.
 *
 * By default the sandbox hard-blocks all network egress (see
 * `metabase/utils/scripts-sandbox/distortions-blocked-apis`). When an app
 * declares `allowed_hosts` in its `data_app.yaml`, those origins — and ONLY
 * those, never the Metabase origin, which stays reachable only via sanctioned
 * SDK calls — become reachable through `fetch`/`XMLHttpRequest`. Host matching
 * mirrors the CSP `connect-src` the backend emits for the same hosts, so the JS
 * layer and the browser CSP layer agree.
 *
 * The wildcard semantics (`*.example.com` matches subdomains, not the apex)
 * intentionally match the backend's `approved-domain?`
 * (`metabase.server.middleware.security`, used for embedding-origin allowlists).
 * There's no shared implementation — that one is Clojure, this runs in the
 * sandboxed browser realm — so keep the two in sync if either changes.
 */

/**
 * The slice of the sandbox's realm the network wrappers touch: the native
 * `fetch`/`XMLHttpRequest` they wrap, and the location a relative request URL
 * resolves against. A real `Window & typeof globalThis` satisfies it.
 */
export interface SandboxRealm {
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  location: { href: string; origin: string };
}

/**
 * A network request the sandbox refused, reported to an optional listener.
 **/
export interface SandboxBlockedNetworkInfo {
  api: "fetch" | "xhr";
  url: string;
  reason: string;
}

export type SandboxBlockedNetworkListener = (
  info: SandboxBlockedNetworkInfo,
) => void;

interface AllowedOrigin {
  protocol: string; // "https:" | "http:"
  wildcard: boolean; // entry was "*.host"
  host: string; // "example.com" (without the leading "*." when wildcard)
  port: string; // "" is the scheme's default port, as in CSP — not "any port"
}

/**
 * A valid `allowed_hosts` entry is *origin-only*: an http(s) scheme + host (+ an
 * optional port), with no path, query, fragment, or credentials.
 */
function isRawHttpOrigin(url: URL): boolean {
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function parseAllowedOrigin(entry: string): AllowedOrigin | null {
  let url: URL;
  try {
    // The standard URL parser lowercases the host, normalizes away the default
    // port (`:443`/`:80` → ""), and accepts a leading `*.` wildcard. The request
    // side (`toUrl`) parses the same way, so both stay consistent.
    url = new URL(entry.trim());
  } catch {
    return null;
  }

  if (!isRawHttpOrigin(url)) {
    return null;
  }

  const wildcard = url.hostname.startsWith("*.");

  return {
    protocol: url.protocol,
    wildcard,
    host: wildcard ? url.hostname.slice(2) : url.hostname,
    port: url.port,
  };
}

function originMatches(url: URL, origin: AllowedOrigin): boolean {
  if (url.protocol !== origin.protocol) {
    return false;
  }

  if (url.port !== origin.port) {
    return false;
  }

  const host = url.hostname.toLowerCase();

  // `*.example.com` matches any subdomain but not the apex (same as CSP).
  return origin.wildcard
    ? host.endsWith(`.${origin.host}`)
    : host === origin.host;
}

export function isHostAllowed(url: URL, allowedHosts: string[]): boolean {
  return allowedHosts.some((entry) => {
    const origin = parseAllowedOrigin(entry);

    return origin ? originMatches(url, origin) : false;
  });
}

function toUrl(input: RequestInfo | URL, base: string): URL | null {
  try {
    if (typeof input === "string") {
      return new URL(input, base);
    }

    if (input instanceof URL) {
      return new URL(input.href, base);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url, base);
    }
  } catch {
    // unparseable → treated as not-allowed by the callers below
  }

  return null;
}

/**
 * The single decision the `fetch` and `XMLHttpRequest` wrappers share: resolve
 * the request URL and decide whether the sandbox may make it. Returns `null`
 * when the request is allowed, or a human-readable reason when it is blocked.
 *
 * A request is allowed only when its origin is in `allowedHosts` AND is not the
 * Metabase origin — raw access to Metabase is *always* denied (the SDK is the
 * sanctioned channel), even if an admin mistakenly lists it in `allowed_hosts`.
 */
function blockedReason(
  input: RequestInfo | URL,
  base: string,
  allowedHosts: string[],
  metabaseOrigin: string,
): string | null {
  const url = toUrl(input, base);

  if (!url) {
    return "an unparseable URL";
  }

  if (url.origin === metabaseOrigin) {
    return `${url.origin} (the instance origin is reachable only via the SDK)`;
  }

  if (!isHostAllowed(url, allowedHosts)) {
    return `${url.host} (not in allowed_hosts)`;
  }

  return null;
}

/**
 * Report a block without letting the listener affect the block itself. A throwing
 * listener would otherwise turn `fetch`'s rejection into a synchronous throw,
 * breaking the promise contract for every `.catch()` caller — and reporting must
 * never be able to change what is blocked.
 */
function reportBlocked(
  onBlocked: SandboxBlockedNetworkListener | undefined,
  event: Parameters<SandboxBlockedNetworkListener>[0],
): void {
  try {
    onBlocked?.(event);
  } catch {
    // A broken reporter is not the app's problem.
  }
}

/**
 * The request URL for a blocked-network report: resolved when parseable.
 **/
function buildRequestUrl(input: RequestInfo | URL, base: string): string {
  return toUrl(input, base)?.href ?? String(input);
}

/**
 * A `fetch` that only reaches `allowedHosts` (rejecting everything else,
 * including the Metabase origin). Returns `null` when the allowlist is empty so
 * the caller keeps the sandbox's default hard block.
 */
export function makeSandboxFetch(
  targetWindow: SandboxRealm,
  allowedHosts: string[],
  label: string,
  onBlocked?: SandboxBlockedNetworkListener,
): typeof fetch | null {
  if (allowedHosts.length === 0) {
    return null;
  }

  const realFetch = targetWindow.fetch.bind(targetWindow);
  const base = targetWindow.location.href;
  const metabaseOrigin = targetWindow.location.origin;

  return function dataAppFetch(input: RequestInfo | URL, init?: RequestInit) {
    const reason = blockedReason(input, base, allowedHosts, metabaseOrigin);

    if (reason) {
      reportBlocked(onBlocked, {
        api: "fetch",
        url: buildRequestUrl(input, base),
        reason,
      });

      return Promise.reject(
        new Error(`[data-app ${label}] blocked fetch to ${reason}`),
      );
    }

    return realFetch(input, init);
  };
}

/**
 * An `XMLHttpRequest` subclass that gates `open()` against `allowedHosts` (and
 * always denies the Metabase origin). Returns `null` when the allowlist is empty
 * (keeps the default hard block).
 */
export function makeSandboxXhr(
  targetWindow: SandboxRealm,
  allowedHosts: string[],
  label: string,
  onBlocked?: SandboxBlockedNetworkListener,
): typeof XMLHttpRequest | null {
  if (allowedHosts.length === 0) {
    return null;
  }

  const NativeXhr = targetWindow.XMLHttpRequest;
  const base = targetWindow.location.href;
  const metabaseOrigin = targetWindow.location.origin;
  const SandboxXhr = class extends NativeXhr {
    open(
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null,
    ): void {
      const reason = blockedReason(url, base, allowedHosts, metabaseOrigin);

      if (reason) {
        reportBlocked(onBlocked, {
          api: "xhr",
          url: buildRequestUrl(url, base),
          reason,
        });

        throw new Error(
          `[data-app ${label}] blocked XMLHttpRequest to ${reason}`,
        );
      }
      super.open(method, url, async, username, password);
    }
  };

  // The subclass inherits the static UNSENT/OPENED/… constants at runtime;
  // cast so the type matches the native constructor the membrane expects.
  return SandboxXhr as typeof XMLHttpRequest;
}
