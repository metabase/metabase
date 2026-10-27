import fetchMock from "fetch-mock";

import { setBasename } from "metabase/utils/basename";

import { handleBrokerRequest, safeRequestHeaders } from "./host-broker";
import type {
  BrokerHttpResponse,
  BrokerRequestMessage,
  BrokerResponseMessage,
} from "./protocol";

// Not valid UTF-8, so a text round trip would replace bytes with U+FFFD.
const BINARY = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x50, 0x4b]);

const encode = (text: string) => new TextEncoder().encode(text).buffer;

const decode = (body: ArrayBuffer | null) =>
  new TextDecoder().decode(body ?? undefined);

const bytes = (body: ArrayBuffer | null | undefined) =>
  new Uint8Array(body ?? new ArrayBuffer(0));

const request = (
  overrides: Partial<Omit<BrokerRequestMessage, "type">>,
): BrokerRequestMessage => ({
  type: "request",
  id: 1,
  method: "GET",
  url: "/api/health",
  headers: {},
  body: null,
  ...overrides,
});

function httpResponse(message: BrokerResponseMessage): BrokerHttpResponse {
  if ("networkError" in message) {
    throw new Error(`expected an HTTP response, got ${message.networkError}`);
  }
  return message;
}

describe("safeRequestHeaders", () => {
  it("keeps the API headers and drops app-injected ones", () => {
    expect(
      safeRequestHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Metabase-Locale": "en",
        "X-Evil-Injected": "1",
        "x-forwarded-host": "attacker.example.com",
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Metabase-Locale": "en",
    });
  });
});

describe("handleBrokerRequest", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    setBasename("");
  });

  it("refuses a non-API path without hitting the network", async () => {
    const res = httpResponse(
      await handleBrokerRequest(request({ method: "GET", url: "/auth/sso" })),
    );

    expect(res.status).toBe(403);
    expect(decode(res.body)).toContain("broker refused");
    expect(fetchMock.callHistory.called()).toBe(false);
  });

  it("proxies an API request and strips the anti-CSRF token from the response", async () => {
    fetchMock.post("path:/api/dataset", {
      status: 200,
      body: { rows: [] },
      headers: {
        "content-type": "application/json",
        "X-Metabase-Anti-CSRF-Token": "super-secret",
      },
    });

    const res = httpResponse(
      await handleBrokerRequest(
        request({ method: "POST", url: "/api/dataset", body: encode("{}") }),
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["x-metabase-anti-csrf-token"]).toBeUndefined();
  });

  it("stamps the data-app client marker, ignoring one the app supplies", async () => {
    fetchMock.post("path:/api/dataset", { status: 200, body: {} });

    await handleBrokerRequest(
      request({
        method: "POST",
        url: "/api/dataset",
        body: encode("{}"),
        // A compromised app claiming to be something the backend confines less.
        headers: { "X-Metabase-Client": "embedding-sdk-react" },
      }),
    );

    const [call] = fetchMock.callHistory.calls();

    expect(call?.request?.headers.get("x-metabase-client")).toBe("data-app");
  });

  it("forwards the SDK version and the data-app identifier", async () => {
    fetchMock.post("path:/api/dataset", { status: 200, body: {} });

    await handleBrokerRequest(
      request({
        method: "POST",
        url: "/api/dataset",
        body: encode("{}"),
        headers: {
          "x-metabase-client-version": "1.2.3",
          "x-metabase-client-identifier": "sales",
        },
      }),
    );

    const [call] = fetchMock.callHistory.calls();

    expect(call?.request?.headers.get("x-metabase-client-version")).toBe(
      "1.2.3",
    );
    expect(call?.request?.headers.get("x-metabase-client-identifier")).toBe(
      "sales",
    );
  });

  it("forwards the embed referrer, so usage rows record the embedding host as they do same-origin", async () => {
    const iframeUrl = "https://apps.example.com/embed/apps/sales";
    fetchMock.post("path:/api/dataset", { status: 200, body: {} });

    await handleBrokerRequest(
      request({
        method: "POST",
        url: "/api/dataset",
        body: encode("{}"),
        headers: { "x-metabase-embed-referrer": iframeUrl },
      }),
    );

    const [call] = fetchMock.callHistory.calls();

    expect(call?.request?.headers.get("x-metabase-embed-referrer")).toBe(
      iframeUrl,
    );
  });

  it("resolves the API prefix against the basename (subpath deploys)", async () => {
    setBasename("/analytics");
    fetchMock.post("path:/analytics/api/dataset", { status: 200, body: {} });

    const res = httpResponse(
      await handleBrokerRequest(
        request({
          method: "POST",
          url: "/analytics/api/dataset",
          body: encode("{}"),
        }),
      ),
    );

    expect(res.status).toBe(200);
  });

  it("refuses an /api path outside the basename (subpath deploys)", async () => {
    setBasename("/analytics");
    fetchMock.get("path:/api/other-service/me", { status: 200, body: {} });

    const res = httpResponse(
      await handleBrokerRequest(
        request({ url: "https://apps.example.com/api/other-service/me" }),
      ),
    );

    expect(res.status).toBe(403);
    expect(fetchMock.callHistory.called()).toBe(false);
  });

  it("relays binary request and response bodies byte for byte", async () => {
    fetchMock.post(
      "path:/api/upload",
      () =>
        new Response(BINARY.slice(), {
          headers: { "content-type": "application/octet-stream" },
        }),
    );

    const res = httpResponse(
      await handleBrokerRequest(
        request({
          method: "POST",
          url: "/api/upload",
          body: BINARY.slice().buffer,
        }),
      ),
    );

    expect(bytes(res.body)).toEqual(BINARY);

    const [call] = fetchMock.callHistory.calls();

    expect(bytes(await call?.request?.arrayBuffer())).toEqual(BINARY);
  });

  it("reports a failed request as a network error, not as an HTTP status", async () => {
    fetchMock.get("path:/api/user/current", {
      throws: new TypeError("Failed to fetch"),
    });

    const res = await handleBrokerRequest(
      request({ url: "/api/user/current" }),
    );

    expect(res).toEqual({ id: 1, networkError: "TypeError: Failed to fetch" });
  });

  it("aborts its own request when the app cancels", async () => {
    fetchMock.post(
      "path:/api/dataset",
      { status: 200, body: {} },
      { delay: 1000 },
    );
    const controller = new AbortController();

    const pendingResponse = handleBrokerRequest(
      request({ method: "POST", url: "/api/dataset", body: encode("{}") }),
      controller.signal,
    );
    controller.abort();
    await pendingResponse;

    const [call] = fetchMock.callHistory.calls();

    expect(call?.request?.signal.aborted).toBe(true);
  });
});
