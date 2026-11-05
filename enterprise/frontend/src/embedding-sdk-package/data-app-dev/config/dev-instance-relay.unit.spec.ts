import { EventEmitter } from "node:events";
import { IncomingMessage, OutgoingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import {
  DATA_APP_DEV_INSTANCE_PING_URL,
  DATA_APP_DEV_RELAY_ERROR_HEADER,
} from "../constants/diagnostics-channel";

import {
  type DevInstanceRelayRoute,
  buildDevInstanceRelay,
  dropInstanceOrigin,
} from "./dev-instance-relay";

const INSTANCE_URL = "http://localhost:3000";
const API_KEY = "mb_dev_key";

/** What the browser sends the dev server; Vite's proxy copies it onto the request to the instance. */
const PAGE_REQUEST_HEADERS = {
  host: "localhost:5174",
  "content-type": "application/json",
  "content-length": "42",
  accept: "application/json",
  "x-metabase-client-version": "0.66.0",
  "x-metabase-data-app-dev": "true",
  "x-metabase-embedded-preview": "true",
  traceparent: "00-trace-span-01",
  // Everything below is the page's or the browser's, and none of it is the dev server's to pass on.
  cookie: "metabase.SESSION=developer-session",
  origin: "http://localhost:5174",
  referer: "http://localhost:5174/",
  "x-api-key": "set-by-the-dev-server",
  "x-metabase-client": "embedding-sdk-react",
  "x-metabase-session": "forged",
  authorization: "Bearer forged",
};

interface SetupOpts {
  apiKey?: string;
}

const setup = ({ apiKey = API_KEY }: SetupOpts = {}) => {
  const routes = buildDevInstanceRelay({ instanceUrl: INSTANCE_URL, apiKey });

  const listen = (route: DevInstanceRelayRoute) => {
    const proxy = new EventEmitter();
    route.configure(proxy);

    return proxy;
  };

  /** The headers that leave the dev server for the instance on `path`'s route. */
  const relayedHeaders = (path: string) => {
    const proxyReq = new OutgoingMessage();
    Object.entries(PAGE_REQUEST_HEADERS).forEach(([name, value]) =>
      proxyReq.setHeader(name, value),
    );
    listen(routes[path]).emit("proxyReq", proxyReq);

    return proxyReq.getHeaders();
  };

  return { routes, listen, relayedHeaders };
};

describe("buildDevInstanceRelay", () => {
  it("relays nothing without a usable instance URL", () => {
    expect(
      buildDevInstanceRelay({ instanceUrl: undefined, apiKey: API_KEY }),
    ).toEqual({});
    expect(buildDevInstanceRelay({ instanceUrl: "", apiKey: API_KEY })).toEqual(
      {},
    );
    expect(
      buildDevInstanceRelay({ instanceUrl: "metabase.local", apiKey: API_KEY }),
    ).toEqual({});
  });

  it("relays the API, the SDK bundle and the ping to the instance", () => {
    const { routes } = setup();

    expect(Object.keys(routes)).toEqual([
      "/api/",
      "/app/",
      DATA_APP_DEV_INSTANCE_PING_URL,
    ]);
    Object.values(routes).forEach((route) =>
      expect(route).toMatchObject({ target: INSTANCE_URL, changeOrigin: true }),
    );
    expect(
      routes[DATA_APP_DEV_INSTANCE_PING_URL].rewrite?.(
        DATA_APP_DEV_INSTANCE_PING_URL,
      ),
    ).toBe("/");
  });

  it("sends API requests with the dev server's key and the data-app client marker, and nothing of the page's credentials", () => {
    const { relayedHeaders } = setup();

    expect(relayedHeaders("/api/")).toEqual({
      host: "localhost:5174",
      "content-type": "application/json",
      "content-length": "42",
      accept: "application/json",
      "x-metabase-client-version": "0.66.0",
      "x-metabase-data-app-dev": "true",
      "x-metabase-embedded-preview": "true",
      traceparent: "00-trace-span-01",
      "x-api-key": API_KEY,
      "x-metabase-client": "data-app",
    });
  });

  it("drops the page's placeholder key when the dev server has none", () => {
    const { relayedHeaders } = setup({ apiKey: "" });

    expect(relayedHeaders("/api/")).not.toHaveProperty("x-api-key");
    expect(relayedHeaders("/api/")).toHaveProperty(
      "x-metabase-client",
      "data-app",
    );
  });

  it("sends the key with API requests only", () => {
    const { relayedHeaders } = setup();

    for (const path of ["/app/", DATA_APP_DEV_INSTANCE_PING_URL]) {
      const headers = relayedHeaders(path);

      expect(headers).not.toHaveProperty("x-api-key");
      expect(headers).not.toHaveProperty("x-metabase-client");
      expect(headers).not.toHaveProperty("cookie");
    }
  });

  it("serves the preview page and clients outside a browser", () => {
    const { routes } = setup();

    for (const route of Object.values(routes)) {
      expect(
        route.bypass({
          headers: {
            host: "localhost:5174",
            origin: "http://localhost:5174",
            "sec-fetch-site": "same-origin",
          },
        }),
      ).toBeUndefined();
      // `curl`, the CLI, a test runner: they could read `.env.local` anyway.
      expect(
        route.bypass({ headers: { host: "localhost:5174" } }),
      ).toBeUndefined();
    }
  });

  it("refuses other pages in the developer's browser, which would otherwise get the key added to their requests", () => {
    const { routes } = setup();
    const otherPages = [
      // A data app on the developer's own Metabase: same-site with the dev server on localhost.
      { origin: "http://localhost:3000", "sec-fetch-site": "same-site" },
      { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
      // A browser that doesn't send `Sec-Fetch-Site` still sends `Origin` with a POST.
      { origin: "https://attacker.example" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
    ];

    for (const route of Object.values(routes)) {
      for (const headers of otherPages) {
        expect(
          route.bypass({ headers: { host: "localhost:5174", ...headers } }),
        ).toBe(false);
      }
    }
  });

  it("keeps the instance's cookies from reaching the page", () => {
    const { routes, listen } = setup();
    const proxyRes = new IncomingMessage(new Socket());
    proxyRes.headers = {
      "content-type": "application/json",
      "set-cookie": ["metabase.SESSION=instance-session"],
    };

    listen(routes["/api/"]).emit("proxyRes", proxyRes);

    expect(proxyRes.headers).toEqual({ "content-type": "application/json" });
  });

  it("marks its own failure to reach the instance, so the preview can tell it from an answer", () => {
    const { routes, listen } = setup();
    const req = new IncomingMessage(new Socket());
    const res = new ServerResponse(req);

    listen(routes[DATA_APP_DEV_INSTANCE_PING_URL]).emit(
      "error",
      new Error("connect ECONNREFUSED 127.0.0.1:3000"),
      req,
      res,
    );

    expect(res.statusCode).toBe(502);
    expect(res.getHeader(DATA_APP_DEV_RELAY_ERROR_HEADER)).toBe("unreachable");
  });

  it("leaves a response that has already started alone", () => {
    const { routes, listen } = setup();
    const req = new IncomingMessage(new Socket());
    const res = new ServerResponse(req);
    res.writeHead(200);

    listen(routes["/api/"]).emit(
      "error",
      new Error("socket hang up"),
      req,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.getHeader(DATA_APP_DEV_RELAY_ERROR_HEADER)).toBeUndefined();
  });
});

describe("dropInstanceOrigin", () => {
  it("drops the entries that would let the page reach the instance directly", () => {
    expect(
      dropInstanceOrigin(
        [
          "http://localhost:3000",
          "http://LOCALHOST:3000",
          "https://api.example.com",
          "http://localhost:4000",
        ],
        INSTANCE_URL,
      ),
    ).toEqual(["https://api.example.com", "http://localhost:4000"]);
  });

  it("drops a wildcard that covers the instance", () => {
    expect(
      dropInstanceOrigin(
        ["https://*.example.com", "https://*.other.test"],
        "https://metabase.example.com",
      ),
    ).toEqual(["https://*.other.test"]);
  });

  it("drops an http entry for an https instance, which CSP also lets through", () => {
    expect(
      dropInstanceOrigin(
        ["http://metabase.example.com"],
        "https://metabase.example.com",
      ),
    ).toEqual([]);
  });

  it("keeps every entry without a usable instance URL", () => {
    const hosts = ["http://localhost:3000"];

    expect(dropInstanceOrigin(hosts, undefined)).toEqual(hosts);
    expect(dropInstanceOrigin(hosts, "metabase.local")).toEqual(hosts);
  });
});
