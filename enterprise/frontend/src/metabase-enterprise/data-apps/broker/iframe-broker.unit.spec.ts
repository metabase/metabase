import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  DATA_APP_BROKER_INIT_MESSAGE_TYPE,
  DATA_APP_IFRAME_BROKER_HASH_KEY,
  DATA_APP_IFRAME_LOCALE_HASH_KEY,
  DATA_APP_ROUTE_MESSAGE_TYPE,
} from "metabase-enterprise/data-apps/constants";

import { handleBrokerRequest } from "./host-broker";
import {
  initDataAppBroker,
  installDataAppFetchBroker,
  installDataAppRouteReporter,
} from "./iframe-broker";
import type {
  BrokerPortMessage,
  BrokerRequestMessage,
  BrokerResponseMessage,
} from "./protocol";

const HOST_ORIGIN = "https://mb.example.com";

// Not valid UTF-8, so a text round trip would replace bytes with U+FFFD.
const UPLOAD = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
const DOWNLOAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x80]);

const bytes = (body: ArrayBuffer | null) =>
  new Uint8Array(body ?? new ArrayBuffer(0));

type HostPort = {
  onmessage: ((event: { data: BrokerResponseMessage }) => void) | null;
  postMessage: jest.Mock<void, [BrokerPortMessage]>;
};

/** The host's end of the broker port: records the iframe's messages, answers on demand. */
const hostPort: HostPort = { onmessage: null, postMessage: jest.fn() };

function sentRequest(index = 0): BrokerRequestMessage {
  const [message] = hostPort.postMessage.mock.calls[index];
  if (message.type !== "request") {
    throw new Error(`expected a request message, got ${message.type}`);
  }
  return message;
}

describe("iframe broker, served from a separate isolated origin", () => {
  let fetchBeforeInstall: typeof window.fetch;

  beforeAll(() => {
    window.history.replaceState(
      {},
      "",
      `/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}`,
    );
    initDataAppBroker();

    // The host answers the iframe's broker-ready message by handing over its port.
    const init = new MessageEvent("message", {
      data: { type: DATA_APP_BROKER_INIT_MESSAGE_TYPE },
      origin: HOST_ORIGIN,
    });
    Object.defineProperties(init, {
      source: { value: window.parent },
      ports: { value: [hostPort] },
    });
    window.dispatchEvent(init);
  });

  // Installed per test, after the shared setup mocks the global fetch, so that
  // requests the broker lets through land on fetch-mock.
  beforeEach(() => {
    fetchBeforeInstall = window.fetch;
    installDataAppFetchBroker();
  });

  afterEach(() => {
    window.fetch = fetchBeforeInstall;
    hostPort.postMessage.mockClear();
  });

  afterAll(() => window.history.replaceState({}, "", "/"));

  it("removes the broker entry from the URL hash, so an app's own router never sees it", () => {
    expect(window.location.hash).not.toContain(DATA_APP_IFRAME_BROKER_HASH_KEY);
  });

  it("round-trips binary bodies through the host byte for byte", async () => {
    const pendingResponse = window.fetch("/api/upload", {
      method: "POST",
      body: UPLOAD,
    });

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    const request = sentRequest();
    expect(bytes(request.body)).toEqual(UPLOAD);

    hostPort.onmessage?.({
      data: {
        id: request.id,
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/octet-stream" },
        body: DOWNLOAD.slice().buffer,
      },
    });

    const response = await pendingResponse;
    expect(bytes(await response.arrayBuffer())).toEqual(DOWNLOAD);
  });

  it("sends the telemetry relay through the host, like every other instance API call", async () => {
    void window.fetch("/api/analytics-proxy", { method: "POST", body: "{}" });

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    expect(sentRequest().url).toMatch(/\/api\/analytics-proxy$/);
    expect(fetchMock.callHistory.called("path:/api/analytics-proxy")).toBe(
      false,
    );
  });

  it("rejects an aborted request with an AbortError, and tells the host to cancel it", async () => {
    const controller = new AbortController();
    const pendingResponse = window.fetch("/api/dataset", {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    });

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    const request = sentRequest();
    controller.abort();

    // An answer that arrives after the abort must not settle the request.
    hostPort.onmessage?.({
      data: {
        id: request.id,
        status: 200,
        statusText: "OK",
        headers: {},
        body: null,
      },
    });

    await expect(pendingResponse).rejects.toHaveProperty("name", "AbortError");
    expect(hostPort.postMessage).toHaveBeenLastCalledWith({
      type: "cancel",
      id: request.id,
    });
  });

  it("rejects with a TypeError, as fetch does, when the host's request fails", async () => {
    fetchMock.get("path:/api/user/current", {
      throws: new TypeError("Failed to fetch"),
    });
    const pendingResponse = window.fetch("/api/user/current");

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    const request = sentRequest();

    // The host is another window, whose fetch is not brokered.
    window.fetch = fetchBeforeInstall;
    hostPort.onmessage?.({ data: await handleBrokerRequest(request) });

    await expect(pendingResponse).rejects.toBeInstanceOf(TypeError);
  });

  it("returns a rejected promise for an invalid request, as fetch does, instead of throwing", async () => {
    let pendingResponse: Promise<Response> | undefined;

    expect(() => {
      pendingResponse = window.fetch("/api/dataset", {
        method: "GET",
        body: "x",
      });
    }).not.toThrow();
    await expect(pendingResponse).rejects.toHaveProperty("name", "TypeError");
  });

  it("keeps brokering when the frame reloads after an in-app navigation", async () => {
    // What the SDK's in-app `navigate("/page")` does.
    window.history.pushState(null, "", "/embed/apps/sales/page");

    await jest.isolateModulesAsync(async () => {
      const reloaded = await import("./iframe-broker");
      reloaded.initDataAppBroker();

      expect(reloaded.isDataAppBrokerMode()).toBe(true);
      expect(reloaded.getDataAppParentOrigin()).toBe(HOST_ORIGIN);
    });
  });

  it("reports each route change to the host, which mirrors it into the top page's URL", () => {
    const { pushState, replaceState } = window.history;
    const postMessage = jest.spyOn(window.parent, "postMessage");

    try {
      installDataAppRouteReporter();
      window.history.pushState(null, "", "/embed/apps/sales/orders/42?tab=1");

      expect(postMessage).toHaveBeenLastCalledWith(
        {
          type: DATA_APP_ROUTE_MESSAGE_TYPE,
          path: "/embed/apps/sales/orders/42",
        },
        HOST_ORIGIN,
      );
    } finally {
      postMessage.mockRestore();
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    }
  });
});

describe("iframe broker, before the host hands over its port", () => {
  it("rejects a request aborted before the handshake with an AbortError, as fetch does", async () => {
    window.history.replaceState(
      {},
      "",
      `/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}`,
    );
    const fetchBeforeInstall = window.fetch;

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await import("./iframe-broker");
        broker.initDataAppBroker();
        broker.installDataAppFetchBroker();

        const onResponse = jest.fn<void, [Response]>();
        const onError = jest.fn<void, [unknown]>();
        const controller = new AbortController();

        window
          .fetch("/api/user/current", { signal: controller.signal })
          .then(onResponse, onError);
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onResponse).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ name: "AbortError" }),
        );
      });
    } finally {
      window.fetch = fetchBeforeInstall;
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("iframe broker, started twice", () => {
  it("asks the host for a port once, so the host doesn't close the port the first handshake got", async () => {
    window.history.replaceState(
      {},
      "",
      `/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}`,
    );
    const postToParent = jest
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await import("./iframe-broker");
        broker.initDataAppBroker();
        broker.initDataAppBroker();

        expect(postToParent).toHaveBeenCalledTimes(1);
      });
    } finally {
      postToParent.mockRestore();
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("iframe broker, offered a port by someone other than its host", () => {
  it("takes the port only from its parent window at the host's origin", async () => {
    window.history.replaceState(
      {},
      "",
      `/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}`,
    );
    const fetchBeforeInstall = window.fetch;
    const otherFrame = document.createElement("iframe");
    document.body.append(otherFrame);

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await import("./iframe-broker");
        broker.initDataAppBroker();
        broker.installDataAppFetchBroker();

        const offer = (port: HostPort, origin: string, source: unknown) => {
          const init = new MessageEvent("message", {
            data: { type: DATA_APP_BROKER_INIT_MESSAGE_TYPE },
            origin,
          });
          Object.defineProperties(init, {
            source: { value: source },
            ports: { value: [port] },
          });
          window.dispatchEvent(init);
        };
        const strangerPort: HostPort = {
          onmessage: null,
          postMessage: jest.fn(),
        };
        const parentPort: HostPort = {
          onmessage: null,
          postMessage: jest.fn(),
        };

        offer(strangerPort, "https://evil.example.com", window.parent);
        offer(strangerPort, HOST_ORIGIN, otherFrame.contentWindow);
        void window.fetch("/api/user/current");
        offer(parentPort, HOST_ORIGIN, window.parent);

        await waitFor(() => expect(parentPort.postMessage).toHaveBeenCalled());
        expect(strangerPort.postMessage).not.toHaveBeenCalled();
      });
    } finally {
      window.fetch = fetchBeforeInstall;
      otherFrame.remove();
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("iframe broker, with the user's locale from the top page", () => {
  const launch = (locale: string) =>
    window.history.replaceState(
      {},
      "",
      `/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}&${DATA_APP_IFRAME_LOCALE_HASH_KEY}=${encodeURIComponent(locale)}`,
    );

  beforeEach(() => window.sessionStorage.clear());

  afterEach(() => window.history.replaceState({}, "", "/"));

  it("keeps the locale, removes it from the hash, and finds it again when the frame reloads", async () => {
    launch("pt_BR");

    await jest.isolateModulesAsync(async () => {
      const broker = await import("./iframe-broker");
      broker.initDataAppBroker();

      expect(broker.getDataAppUserLocale()).toBe("pt_BR");
      expect(window.location.hash).toBe("");
    });

    window.history.pushState(null, "", "/embed/apps/sales/page");

    await jest.isolateModulesAsync(async () => {
      const reloaded = await import("./iframe-broker");
      reloaded.initDataAppBroker();

      expect(reloaded.getDataAppUserLocale()).toBe("pt_BR");
    });
  });

  it("ignores a value that is not a locale code", async () => {
    launch("../../evil");

    await jest.isolateModulesAsync(async () => {
      const broker = await import("./iframe-broker");
      broker.initDataAppBroker();

      expect(broker.getDataAppUserLocale()).toBeNull();
    });
  });
});
