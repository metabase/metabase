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

import type { SandboxBlockedNetworkListener, SandboxRealm } from "./types";

/** A network request the sandbox refused, reported to an optional listener. */
export interface SandboxBlockedNetworkInfo {
  api: "fetch" | "xhr";
  /** The request URL as resolved (or the raw input when unparseable). */
  url: string;
  /** Human-readable block reason, e.g. `api.foo.com (not in allowed_hosts)`. */
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
const isRawHttpOrigin = (url: URL): boolean => {
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  );
};

const parseAllowedOrigin = (entry: string): AllowedOrigin | null => {
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
};

const isOriginMatches = (url: URL, origin: AllowedOrigin): boolean => {
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
};

export const isHostAllowed = (url: URL, allowedHosts: string[]): boolean => {
  return allowedHosts.some((entry) => {
    const origin = parseAllowedOrigin(entry);

    return origin ? isOriginMatches(url, origin) : false;
  });
};

const toUrl = (input: RequestInfo | URL, base: string): URL | null => {
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
};

const getBlockedReason = (
  input: RequestInfo | URL,
  base: string,
  allowedHosts: string[],
  metabaseOrigin: string,
): string | null => {
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
};

const reportBlockedEvent = (
  onBlocked: SandboxBlockedNetworkListener | undefined,
  event: Parameters<SandboxBlockedNetworkListener>[0],
): void => {
  try {
    onBlocked?.(event);
  } catch {
    // A broken reporter is not the app's problem.
  }
};

const buildRequestUrl = (input: RequestInfo | URL, base: string): string => {
  return toUrl(input, base)?.href ?? String(input);
};

export const makeSandboxFetch = (
  targetWindow: SandboxRealm,
  allowedHosts: string[],
  label: string,
  onBlocked?: SandboxBlockedNetworkListener,
): typeof fetch | null => {
  if (allowedHosts.length === 0) {
    return null;
  }

  const realFetch = targetWindow.fetch.bind(targetWindow);
  const base = targetWindow.location.href;
  const metabaseOrigin = targetWindow.location.origin;

  return function dataAppFetch(input: RequestInfo | URL, init?: RequestInit) {
    const reason = getBlockedReason(input, base, allowedHosts, metabaseOrigin);

    if (reason) {
      reportBlockedEvent(onBlocked, {
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
};

export const makeSandboxXhr = (
  targetWindow: SandboxRealm,
  allowedHosts: string[],
  label: string,
  onBlocked?: SandboxBlockedNetworkListener,
): typeof XMLHttpRequest | null => {
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
      const reason = getBlockedReason(url, base, allowedHosts, metabaseOrigin);

      if (reason) {
        reportBlockedEvent(onBlocked, {
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
};
