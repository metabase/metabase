import type {
  IncomingMessage,
  OutgoingMessage,
  ServerResponse,
} from "node:http";
import type { Socket } from "node:net";

import type { ProxyOptions } from "vite";

import type { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import {
  DATA_APP_DEV_INSTANCE_API_PATH,
  DATA_APP_DEV_INSTANCE_PING_URL,
  DATA_APP_DEV_RELAY_ERROR_HEADER,
} from "../constants/diagnostics-channel";
import { parseInstanceUrl } from "../constants/env";

/**
 * Request headers the dev server passes from the preview to the instance. Credentials, cookies and who the request is
 * from aren't among them: the dev server sets its own.
 */
const FORWARDED_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  // Let the instance compress and revalidate what it sends, the multi-MB SDK bundle included.
  "accept-encoding",
  "if-none-match",
  "if-modified-since",
  "x-metabase-locale",
  "x-metabase-client-version",
  "x-metabase-embed-referrer",
  "traceparent",
]);

/** What the outgoing request needs to carry its body to the instance. */
const TRANSPORT_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
]);

/** Matches `metabase.analytics.sdk/data-app-client`; typed off the SDK config so a typo can't compile. */
const DATA_APP_CLIENT: (typeof EMBEDDING_SDK_CONFIG)["metabaseClientRequestHeader"] =
  "data-app";

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

/** An `allowed_hosts` entry a published app can have, once normalized: `::allowed-host` in `metabase.data-apps.schema`. */
const ALLOWED_HOST_PATTERN =
  /^(https?):\/\/((?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d+))?$/;

type RelayedRequest = Pick<
  OutgoingMessage,
  "getHeaderNames" | "removeHeader" | "setHeader"
>;

/** The proxy events the relay handles; Vite's proxy server emits them. */
export interface RelayEvents {
  on(event: "proxyReq", listener: (proxyReq: RelayedRequest) => void): unknown;
  on(event: "proxyRes", listener: (proxyRes: IncomingMessage) => void): unknown;
  on(
    event: "error",
    listener: (
      error: Error,
      req: IncomingMessage,
      res: ServerResponse | Socket,
    ) => void,
  ): unknown;
}

type RelayedRequestSource = Pick<IncomingMessage, "headers">;

export interface DevInstanceRelayRoute extends Omit<
  ProxyOptions,
  "configure" | "bypass"
> {
  configure: (proxy: RelayEvents) => void;
  /** `false` refuses the request with a 404. */
  bypass: (req: RelayedRequestSource) => false | undefined;
}

interface DevInstanceRelayOptions {
  /** `DATA_APP_MB_URL`. */
  instanceUrl: string | undefined;
  /** `DATA_APP_MB_API_KEY`. */
  apiKey: string | undefined;
  /** The app the preview runs, whose rules the instance applies to its requests. */
  appSlug: string;
}

/**
 * Whether the relay takes `req`: from the preview page itself, or from outside a browser, which could read
 * `.env.local` anyway. Any other page in the developer's browser could otherwise make the relay send its requests with
 * the key: a site they visit, or a data app on their own Metabase, which is same-site with the dev server on
 * localhost. A browser that sends `Sec-Fetch-Site` says itself whether the request is same-origin, even behind a
 * tunnel that rewrites `Host`; `Origin` decides for one that doesn't.
 */
const mayRelay = ({ headers }: RelayedRequestSource): boolean => {
  const fetchSite = headers["sec-fetch-site"];

  if (fetchSite !== undefined) {
    return fetchSite === "same-origin";
  }

  const { origin, host } = headers;

  return (
    origin === undefined ||
    (URL.canParse(origin) && new URL(origin).host === host)
  );
};

const route = (
  target: string,
  headers: Record<string, string>,
  rewrite?: (path: string) => string,
): DevInstanceRelayRoute => ({
  target,
  changeOrigin: true,
  rewrite,
  bypass: (req) => (mayRelay(req) ? undefined : false),
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq
        .getHeaderNames()
        .filter(
          (name) =>
            !TRANSPORT_HEADERS.has(name) &&
            !FORWARDED_REQUEST_HEADERS.has(name),
        )
        .forEach((name) => proxyReq.removeHeader(name));

      Object.entries(headers).forEach(([name, value]) =>
        proxyReq.setHeader(name, value),
      );
    });

    proxy.on("proxyRes", (proxyRes) => {
      delete proxyRes.headers["set-cookie"];
    });

    // Marks the dev server's own failure, so the preview can tell an instance that's down from one that answers.
    proxy.on("error", (error, _req, res) => {
      if ("writeHead" in res && !res.headersSent && !res.writableEnded) {
        res.statusCode = 502;
        res.setHeader("content-type", "text/plain");
        res.setHeader(DATA_APP_DEV_RELAY_ERROR_HEADER, "unreachable");
        res.end(error.message);
      }
    });
  },
});

/**
 * Whether the `allowed_hosts` entry `host` lets a request reach `instance`, as the browser's CSP matcher reads it:
 * `*.domain` covers its subdomains, `http` also covers `https`, and a port-less entry means the instance scheme's
 * default port. An entry a published app can't have counts as covering the instance: what it covers isn't read here.
 */
const coversInstance = (host: string, instance: URL): boolean => {
  const match = host
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "")
    .match(ALLOWED_HOST_PATTERN);

  if (!match) {
    return true;
  }

  const [, scheme, name, port] = match;
  const instanceScheme = instance.protocol.slice(0, -1);
  const defaultPort = DEFAULT_PORTS[instance.protocol];

  const coversHost = name.startsWith("*.")
    ? instance.hostname.endsWith(name.slice(1))
    : instance.hostname === name;
  const coversScheme =
    scheme === instanceScheme ||
    (scheme === "http" && instanceScheme === "https");
  const coversPort = (port ?? defaultPort) === (instance.port || defaultPort);

  return coversHost && coversScheme && coversPort;
};

/**
 * `allowedHosts` without the entries that cover the instance at `instanceUrl`, as the instance drops them for a
 * published app, or that a published app can't have. The preview's requests reach the instance through the relay; a
 * direct one would carry the developer's own Metabase cookies.
 */
export function dropInstanceOrigin(
  allowedHosts: string[],
  instanceUrl: string | null | undefined,
): string[] {
  const instance = parseInstanceUrl(instanceUrl);

  return instance
    ? allowedHosts.filter((host) => !coversInstance(host, instance))
    : allowedHosts;
}

/**
 * The dev server's relay to the instance, as Vite `server.proxy` routes. The preview reaches the instance's API only
 * through it: `/api/` requests get the API key there, and are marked as this app's preview, which confines them to the
 * endpoints a data app may call. So the key never reaches the page, and the relay never passes on the developer's own
 * Metabase session. No routes without an `http(s)` `instanceUrl`.
 */
export function buildDevInstanceRelay({
  instanceUrl,
  apiKey,
  appSlug,
}: DevInstanceRelayOptions): Record<string, DevInstanceRelayRoute> {
  if (!instanceUrl || !parseInstanceUrl(instanceUrl)) {
    return {};
  }

  // Who the request is from is the dev server's to say: the instance takes from these the endpoints it may reach, the
  // app whose rules apply, and that it's a preview, which also keeps it out of the app's usage analytics and view log.
  const apiHeaders: Record<string, string> = {
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    "x-metabase-client": DATA_APP_CLIENT,
    "x-metabase-client-identifier": appSlug,
    "x-metabase-data-app-dev": "true",
    "x-metabase-embedded-preview": "true",
  };

  return {
    [DATA_APP_DEV_INSTANCE_API_PATH]: route(instanceUrl, apiHeaders),
    // The SDK bundle and its assets.
    "/app/": route(instanceUrl, {}),
    [DATA_APP_DEV_INSTANCE_PING_URL]: route(instanceUrl, {}, () => "/"),
  };
}
