import type {
  IncomingMessage,
  OutgoingMessage,
  ServerResponse,
} from "node:http";
import type { Socket } from "node:net";

import type { ProxyOptions } from "vite";

import type { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import {
  DATA_APP_DEV_INSTANCE_PING_URL,
  DATA_APP_DEV_RELAY_ERROR_HEADER,
} from "../constants/diagnostics-channel";

/**
 * Request headers the dev server passes from the preview to the instance. Credentials, cookies and the client marker
 * aren't among them: the dev server sets its own.
 */
const FORWARDED_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  "x-metabase-locale",
  "x-metabase-client-version",
  "x-metabase-client-identifier",
  "x-metabase-embed-referrer",
  "x-metabase-data-app-dev",
  // Keeps the preview's traffic out of the app's usage analytics and view log.
  "x-metabase-embedded-preview",
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
}

/**
 * Whether `req` comes from the preview page itself, or from outside a browser (which could read `.env.local` anyway).
 * Any other page in the developer's browser could otherwise make the relay send its requests with the key: a site
 * they visit, or a data app on their own Metabase, which is same-site with the dev server on localhost.
 */
const isFromPreviewPage = ({ headers }: RelayedRequestSource): boolean => {
  const fetchSite = headers["sec-fetch-site"];

  if (fetchSite !== undefined && fetchSite !== "same-origin") {
    return false;
  }

  const { origin, host } = headers;

  return (
    origin === undefined ||
    (URL.canParse(origin) && new URL(origin).host === host)
  );
};

const route = (
  instanceUrl: string,
  headers: Record<string, string>,
  rewrite?: (path: string) => string,
): DevInstanceRelayRoute => ({
  target: instanceUrl,
  changeOrigin: true,
  rewrite,
  bypass: (req) => (isFromPreviewPage(req) ? undefined : false),
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
 * `allowedHosts` without the entries that cover the instance at `instanceUrl`, as the instance drops them for a
 * published app. The preview reaches the instance only through the relay; a direct request would carry the
 * developer's own Metabase cookies.
 */
export function dropInstanceOrigin(
  allowedHosts: string[],
  instanceUrl: string | undefined,
): string[] {
  if (!instanceUrl || !URL.canParse(instanceUrl)) {
    return allowedHosts;
  }

  const instance = new URL(instanceUrl);

  return allowedHosts.filter((host) => !coversInstance(host, instance));
}

/**
 * Whether the `allowed_hosts` entry `host` lets a request reach `instance`, as the preview's CSP and sandbox match it:
 * `*.example.com` covers subdomains, and an `http:` entry also covers the same host over `https:`.
 */
const coversInstance = (host: string, instance: URL): boolean => {
  if (!URL.canParse(host.trim())) {
    return false;
  }

  const entry = new URL(host.trim());
  const isWildcard = entry.hostname.startsWith("*.");
  const coversHost = isWildcard
    ? instance.hostname.endsWith(entry.hostname.slice(1))
    : instance.hostname === entry.hostname;
  const coversProtocol =
    entry.protocol === instance.protocol ||
    (entry.protocol === "http:" && instance.protocol === "https:");

  return coversHost && coversProtocol && entry.port === instance.port;
};

/**
 * The dev server's relay to the instance, as Vite `server.proxy` routes. The preview reaches the instance only through
 * it: `/api/` requests get the API key and the data-app client marker here, which confines them to the endpoints a data
 * app may call, so the key never reaches the page and the developer's own Metabase session never reaches the instance.
 * No routes without a usable `instanceUrl`.
 */
export function buildDevInstanceRelay({
  instanceUrl,
  apiKey,
}: DevInstanceRelayOptions): Record<string, DevInstanceRelayRoute> {
  if (!instanceUrl || !URL.canParse(instanceUrl)) {
    return {};
  }

  const apiHeaders: Record<string, string> = {
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    "x-metabase-client": DATA_APP_CLIENT,
  };

  return {
    "/api/": route(instanceUrl, apiHeaders),
    // The SDK bundle and its assets.
    "/app/": route(instanceUrl, {}),
    [DATA_APP_DEV_INSTANCE_PING_URL]: route(instanceUrl, {}, () => "/"),
  };
}
