/**
 * Per-app fetch/XHR allowlist for the data-app Near-Membrane sandbox.
 *
 * By default the sandbox hard-blocks all network egress (see
 * `metabase/utils/scripts-sandbox/distortions-blocked-apis`). When an app
 * declares `allowed_hosts` in its `data_app.yml`, those origins — and ONLY
 * those, never the Metabase origin, which stays reachable only via sanctioned
 * SDK calls — become reachable through `fetch`/`XMLHttpRequest`. The host
 * matching here mirrors the CSP `connect-src` the backend emits for the same
 * hosts, so the JS layer and the browser CSP layer agree.
 */

interface AllowedOrigin {
  protocol: string; // "https:" | "http:"
  wildcard: boolean; // entry was "*.host"
  host: string; // "example.com" (without the leading "*." when wildcard)
  port: string; // "" means "any port" (the entry omitted one)
}

function parseAllowedOrigin(entry: string): AllowedOrigin | null {
  const match = /^(https?):\/\/(\*\.)?([^/:]+)(?::(\d+))?$/i.exec(entry.trim());
  if (!match) {
    return null;
  }
  return {
    protocol: `${match[1].toLowerCase()}:`,
    wildcard: Boolean(match[2]),
    host: match[3].toLowerCase(),
    port: match[4] ?? "",
  };
}

function originMatches(url: URL, origin: AllowedOrigin): boolean {
  if (url.protocol !== origin.protocol) {
    return false;
  }
  // `url.port` is "" for default ports; an entry without a port matches any.
  if (origin.port && url.port !== origin.port) {
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

function toUrl(input: unknown, base: string): URL | null {
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
 * A `fetch` that only reaches `allowedHosts` (rejecting everything else,
 * including the Metabase origin). Returns `null` when the allowlist is empty so
 * the caller keeps the sandbox's default hard block.
 */
export function makeSandboxFetch(
  targetWindow: Window & typeof globalThis,
  allowedHosts: string[],
  label: string,
): typeof fetch | null {
  if (allowedHosts.length === 0) {
    return null;
  }
  const realFetch = targetWindow.fetch.bind(targetWindow);
  const base = targetWindow.location.href;
  return function dataAppFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = toUrl(input, base);
    if (!url || !isHostAllowed(url, allowedHosts)) {
      return Promise.reject(
        new Error(
          `[data-app ${label}] blocked fetch to ${url?.host ?? "an unparseable URL"} — not in allowed_hosts`,
        ),
      );
    }
    return realFetch(input, init);
  };
}

/**
 * An `XMLHttpRequest` subclass that gates `open()` against `allowedHosts`.
 * Returns `null` when the allowlist is empty (keeps the default hard block).
 */
export function makeSandboxXhr(
  targetWindow: Window & typeof globalThis,
  allowedHosts: string[],
  label: string,
): typeof XMLHttpRequest | null {
  if (allowedHosts.length === 0) {
    return null;
  }
  const NativeXhr = targetWindow.XMLHttpRequest;
  const base = targetWindow.location.href;
  const SandboxXhr = class extends NativeXhr {
    open(
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null,
    ): void {
      const parsed = toUrl(url, base);
      if (!parsed || !isHostAllowed(parsed, allowedHosts)) {
        throw new Error(
          `[data-app ${label}] blocked XMLHttpRequest to ${String(url)} — not in allowed_hosts`,
        );
      }
      super.open(method, url, async, username, password);
    }
  };
  // The subclass inherits the static UNSENT/OPENED/… constants at runtime;
  // cast so the type matches the native constructor the membrane expects.
  return SandboxXhr as typeof XMLHttpRequest;
}
