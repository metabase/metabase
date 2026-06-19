/**
 * Per-app fetch/XHR allowlist for the data-app Near-Membrane sandbox.
 *
 * By default the sandbox hard-blocks all network egress (see
 * `metabase/utils/scripts-sandbox/distortions-blocked-apis`). When an app
 * declares `allowed_hosts` in its `data_app.yml`, those origins — and ONLY
 * those, never the Metabase origin, which stays reachable only via sanctioned
 * SDK calls — become reachable through `fetch`/`XMLHttpRequest`. Host matching
 * mirrors the CSP `connect-src` the backend emits for the same hosts, so the JS
 * layer and the browser CSP layer agree.
 */

interface AllowedOrigin {
  protocol: string; // "https:" | "http:"
  wildcard: boolean; // entry was "*.host"
  host: string; // "example.com" (without the leading "*." when wildcard)
  port: string; // "" the scheme's default port
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

// `URL.port` is "" for the scheme's default port; normalize so an explicit
// `:443`/`:80` compares equal to the implicit default (as CSP host-source does).
function effectivePort(protocol: string, port: string): string {
  if (port) {
    return port;
  }
  if (protocol === "https:") {
    return "443";
  }
  if (protocol === "http:") {
    return "80";
  }
  return "";
}

function originMatches(url: URL, origin: AllowedOrigin): boolean {
  if (url.protocol !== origin.protocol) {
    return false;
  }
  if (
    effectivePort(url.protocol, url.port) !==
    effectivePort(origin.protocol, origin.port)
  ) {
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
 * The single decision the `fetch` and `XMLHttpRequest` wrappers share: resolve
 * the request URL and decide whether the sandbox may make it. Returns `null`
 * when the request is allowed, or a human-readable reason when it is blocked.
 *
 * A request is allowed only when its origin is in `allowedHosts` AND is not the
 * Metabase origin — raw access to Metabase is *always* denied (the SDK is the
 * sanctioned channel), even if an admin mistakenly lists it in `allowed_hosts`.
 */
function blockedReason(
  input: unknown,
  base: string,
  allowedHosts: string[],
  metabaseOrigin: string,
): string | null {
  const url = toUrl(input, base);
  if (!url) {
    return "an unparseable URL";
  }
  if (url.origin === metabaseOrigin) {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- developer-facing sandbox diagnostic, not localized UI
    return `${url.origin} (the Metabase origin is reachable only via the SDK)`;
  }
  if (!isHostAllowed(url, allowedHosts)) {
    return `${url.host} (not in allowed_hosts)`;
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
  const metabaseOrigin = targetWindow.location.origin;
  return function dataAppFetch(input: RequestInfo | URL, init?: RequestInit) {
    const reason = blockedReason(input, base, allowedHosts, metabaseOrigin);
    if (reason) {
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
  targetWindow: Window & typeof globalThis,
  allowedHosts: string[],
  label: string,
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
