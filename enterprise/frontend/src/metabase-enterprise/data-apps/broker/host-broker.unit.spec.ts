import {
  MessageChannel as NodeMessageChannel,
  MessagePort as NodeMessagePort,
} from "node:worker_threads";

import fetchMock from "fetch-mock";

import { setBasename } from "metabase/utils/basename";
import {
  DATA_APP_BROKER_INIT_MESSAGE_TYPE,
  DATA_APP_BROKER_READY_MESSAGE_TYPE,
  DATA_APP_READY_MESSAGE_TYPE,
} from "metabase-enterprise/data-apps/constants";

import {
  handleBrokerRequest,
  installHostBroker,
  safeRequestHeaders,
} from "./host-broker";
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

  it("reports a request the browser can't build as a network error, as fetch does", async () => {
    const res = await handleBrokerRequest(
      request({ method: "GET", body: encode("a GET can't have a body") }),
    );

    expect(res).toEqual({
      id: 1,
      networkError: expect.stringContaining("TypeError"),
    });
    expect(fetchMock.callHistory.called()).toBe(false);
  });
});

describe("installHostBroker", () => {
  const FRAME_ORIGIN = "https://apps.example.com";

  let iframe: HTMLIFrameElement;
  let frameWindow: Window;
  let teardown: () => void;
  const postToFrame = jest.fn<void, [unknown, string, Transferable[]]>();
  const openPorts: MessagePort[] = [];

  // jsdom has no `MessageChannel`; Node's carries messages the same way.
  beforeAll(() => {
    Object.defineProperties(globalThis, {
      MessageChannel: { value: NodeMessageChannel, configurable: true },
      MessagePort: { value: NodeMessagePort, configurable: true },
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "MessageChannel");
    Reflect.deleteProperty(globalThis, "MessagePort");
  });

  beforeEach(() => {
    fetchMock.get("path:/api/health", { status: 200, body: "ok" });
    iframe = document.createElement("iframe");
    document.body.append(iframe);
    if (!iframe.contentWindow) {
      throw new Error("an attached iframe has a window");
    }
    frameWindow = iframe.contentWindow;
    Object.defineProperty(frameWindow, "postMessage", { value: postToFrame });
    teardown = installHostBroker(iframe, FRAME_ORIGIN);
  });

  afterEach(() => {
    teardown();
    openPorts.splice(0).forEach((port) => port.close());
    postToFrame.mockReset();
    iframe.remove();
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  function sendReady({
    origin = FRAME_ORIGIN,
    source = frameWindow,
    type = DATA_APP_BROKER_READY_MESSAGE_TYPE,
  }: { origin?: string; source?: Window; type?: string } = {}) {
    const event = new MessageEvent("message", { data: { type }, origin });
    Object.defineProperty(event, "source", { value: source });
    window.dispatchEvent(event);
  }

  function handedPort(index = 0): MessagePort {
    const [message, targetOrigin, transfer] = postToFrame.mock.calls[index];
    expect(message).toMatchObject({ type: DATA_APP_BROKER_INIT_MESSAGE_TYPE });
    expect(targetOrigin).toBe(FRAME_ORIGIN);
    const [port] = transfer;
    if (!(port instanceof MessagePort)) {
      throw new Error("expected the host to transfer a MessagePort");
    }
    openPorts.push(port);
    return port;
  }

  async function isRelayed(port: MessagePort): Promise<boolean> {
    const answered = new Promise<boolean>((resolve) => {
      port.onmessage = () => resolve(true);
      setTimeout(() => resolve(false), 200);
    });
    port.postMessage(request({ url: "/api/health" }));
    return answered;
  }

  it("hands its own frame a port when the frame's document is ready, and relays requests on it", async () => {
    sendReady();

    expect(postToFrame).toHaveBeenCalledTimes(1);
    expect(await isRelayed(handedPort())).toBe(true);
  });

  it("passes the user's locale with the port, since the isolated origin serves the frame without a signed-in user", () => {
    window.MetabaseLocales = { user: "pt_BR", site: "en" };

    try {
      sendReady();

      expect(postToFrame.mock.calls[0][0]).toEqual({
        type: DATA_APP_BROKER_INIT_MESSAGE_TYPE,
        locale: "pt_BR",
      });
    } finally {
      delete window.MetabaseLocales;
    }
  });

  it("ignores a ready message from another origin, from another window, or of another type", () => {
    sendReady({ origin: "https://evil.example.com" });
    sendReady({ source: window });
    sendReady({ type: DATA_APP_READY_MESSAGE_TYPE });

    expect(postToFrame).not.toHaveBeenCalled();
  });

  it("stops relaying when it is torn down", async () => {
    sendReady();
    const port = handedPort();
    teardown();

    expect(await isRelayed(port)).toBe(false);
    expect(fetchMock.callHistory.called()).toBe(false);
  });

  it("stops relaying on the old port when the frame asks again, as a reloaded frame does", async () => {
    sendReady();
    const oldPort = handedPort();
    sendReady();
    const newPort = handedPort(1);

    expect(await isRelayed(oldPort)).toBe(false);
    expect(await isRelayed(newPort)).toBe(true);
  });
});
