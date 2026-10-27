import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import {
  DATA_APP_BROKER_INIT_MESSAGE_TYPE,
  DATA_APP_ROUTE_MESSAGE_TYPE,
} from "metabase-enterprise/data-apps/constants";
import type { EnterpriseSettings } from "metabase-types/api";

import { handleBrokerRequest } from "./host-broker";
import {
  getDataAppUserLocale,
  initDataAppBroker,
  installDataAppFetchBroker,
  installDataAppRouteReporter,
} from "./iframe-broker";
import type {
  BrokerInitMessage,
  BrokerPortMessage,
  BrokerRequestMessage,
  BrokerResponseMessage,
} from "./protocol";

const HOST_ORIGIN = "https://mb.example.com";

/** What the bootstrap of an app document served from the isolated origin carries. */
const ON_ISOLATED_ORIGIN: Partial<EnterpriseSettings> = {
  "isolated-origin": window.location.origin,
  "site-url": `${HOST_ORIGIN}/metabase`,
};

// Not valid UTF-8, so a text round trip would replace bytes with U+FFFD.
const UPLOAD = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
const DOWNLOAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x80]);

const bytes = (body: ArrayBuffer | null) =>
  new Uint8Array(body ?? new ArrayBuffer(0));

type HostPort = {
  onmessage: ((event: { data: BrokerResponseMessage }) => void) | null;
  postMessage: jest.Mock<void, [BrokerPortMessage, Transferable[]?]>;
};

const createHostPort = (): HostPort => ({
  onmessage: null,
  postMessage: jest.fn(),
});

/** The host's end of the broker port: records the iframe's messages, answers on demand. */
const hostPort = createHostPort();

function sentRequest(index = 0): BrokerRequestMessage {
  const [message] = hostPort.postMessage.mock.calls[index];
  if (message.type !== "request") {
    throw new Error(`expected a request message, got ${message.type}`);
  }
  return message;
}

/** The host's answer to the iframe's broker-ready message: its port, and the user's locale. */
function offerPort(
  port: HostPort,
  {
    origin = HOST_ORIGIN,
    source = window.parent,
    locale = null,
  }: { origin?: string; source?: Window | null; locale?: string | null } = {},
) {
  const data: BrokerInitMessage = {
    type: DATA_APP_BROKER_INIT_MESSAGE_TYPE,
    locale,
  };
  const init = new MessageEvent("message", { data, origin });
  Object.defineProperties(init, {
    source: { value: source },
    ports: { value: [port] },
  });
  window.dispatchEvent(init);
}

/**
 * The broker as a newly loaded app document gets it, reading `settings` from its
 * bootstrap. Call inside `jest.isolateModulesAsync`.
 */
async function importFreshBroker(
  settings: Partial<EnterpriseSettings> = ON_ISOLATED_ORIGIN,
) {
  const { mockSettings: mockFreshSettings } =
    await import("__support__/settings");
  mockFreshSettings(settings);
  return import("./iframe-broker");
}

describe("iframe broker, served from a separate isolated origin", () => {
  let fetchBeforeInstall: typeof window.fetch;

  beforeAll(() => {
    window.history.replaceState({}, "", "/embed/apps/sales");
    mockSettings(ON_ISOLATED_ORIGIN);
    initDataAppBroker();
    offerPort(hostPort);
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

  afterAll(() => {
    mockSettings();
    window.history.replaceState({}, "", "/");
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

  it("hands the request body to the host instead of copying it", async () => {
    void window.fetch("/api/upload", { method: "POST", body: UPLOAD });

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    const [, transfer] = hostPort.postMessage.mock.calls[0];

    expect(transfer).toEqual([sentRequest().body]);
    expect(transfer?.[0]).toBe(sentRequest().body);
  });

  it("forwards the redirect mode the app asked for", async () => {
    void window.fetch("/api/user/current", { redirect: "error" });

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    expect(sentRequest().redirect).toBe("error");
  });

  it("answers an opaque redirect, as fetch does for redirect: manual", async () => {
    const pendingResponse = window.fetch("/api/user/current", {
      redirect: "manual",
    });

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    hostPort.onmessage?.({
      data: { id: sentRequest().id, opaqueRedirect: true },
    });
    const response = await pendingResponse;

    expect(response.type).toBe("opaqueredirect");
    expect(response.status).toBe(0);
    expect(response.ok).toBe(false);
    expect(response.url).toMatch(/\/api\/user\/current$/);
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
      const reloaded = await importFreshBroker();
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

  it("leaves the user's locale to the document when the host passes none", async () => {
    expect(await getDataAppUserLocale()).toBeNull();
  });
});

describe("iframe broker, in a document that isn't on the isolated origin", () => {
  it.each<[string, Partial<EnterpriseSettings>]>([
    ["MB_ISOLATED_ORIGIN is unset", { "isolated-origin": null }],
    [
      "the document is on another origin",
      { "isolated-origin": "https://apps.example.com" },
    ],
  ])("stays out of the way when %s", async (_, settings) => {
    const postToParent = jest
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await importFreshBroker({
          ...ON_ISOLATED_ORIGIN,
          ...settings,
        });
        broker.initDataAppBroker();

        expect(broker.isDataAppBrokerMode()).toBe(false);
        expect(broker.getDataAppParentOrigin()).toBe(window.location.origin);
        expect(await broker.getDataAppUserLocale()).toBeNull();
        expect(postToParent).not.toHaveBeenCalled();
      });
    } finally {
      postToParent.mockRestore();
    }
  });
});

describe("iframe broker, before the host hands over its port", () => {
  it("rejects a request aborted before the handshake with an AbortError, as fetch does", async () => {
    const fetchBeforeInstall = window.fetch;

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await importFreshBroker();
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
    }
  });
});

describe("iframe broker, started twice", () => {
  it("asks the host for a port once, so the host doesn't close the port the first handshake got", async () => {
    const postToParent = jest
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => undefined);

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await importFreshBroker();
        broker.initDataAppBroker();
        broker.initDataAppBroker();

        expect(postToParent).toHaveBeenCalledTimes(1);
        expect(postToParent).toHaveBeenCalledWith(
          expect.anything(),
          HOST_ORIGIN,
        );
      });
    } finally {
      postToParent.mockRestore();
    }
  });
});

describe("iframe broker, offered a port by someone other than its host", () => {
  it("takes the port only from its parent window at the host's origin", async () => {
    const fetchBeforeInstall = window.fetch;
    const otherFrame = document.createElement("iframe");
    document.body.append(otherFrame);

    try {
      await jest.isolateModulesAsync(async () => {
        const broker = await importFreshBroker();
        broker.initDataAppBroker();
        broker.installDataAppFetchBroker();

        const strangerPort = createHostPort();
        const parentPort = createHostPort();

        offerPort(strangerPort, { origin: "https://evil.example.com" });
        offerPort(strangerPort, { source: otherFrame.contentWindow });
        void window.fetch("/api/user/current");
        offerPort(parentPort);

        await waitFor(() => expect(parentPort.postMessage).toHaveBeenCalled());
        expect(strangerPort.postMessage).not.toHaveBeenCalled();
      });
    } finally {
      window.fetch = fetchBeforeInstall;
      otherFrame.remove();
    }
  });
});

describe("iframe broker, with the user's locale from the top page", () => {
  it("takes the user's locale from the host's handshake", async () => {
    await jest.isolateModulesAsync(async () => {
      const broker = await importFreshBroker();
      broker.initDataAppBroker();
      const userLocale = broker.getDataAppUserLocale();
      offerPort(createHostPort(), { locale: "pt_BR" });

      expect(await userLocale).toBe("pt_BR");
    });
  });

  it("ignores a value that is not a locale code", async () => {
    await jest.isolateModulesAsync(async () => {
      const broker = await importFreshBroker();
      broker.initDataAppBroker();
      offerPort(createHostPort(), { locale: "../../evil" });

      expect(await broker.getDataAppUserLocale()).toBeNull();
    });
  });
});
