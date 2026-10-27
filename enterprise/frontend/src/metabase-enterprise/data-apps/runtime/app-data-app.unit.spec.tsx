import { act, waitFor } from "@testing-library/react";

import {
  DATA_APP_BROKER_INIT,
  DATA_APP_IFRAME_BROKER_HASH_KEY,
} from "metabase-enterprise/data-apps/constants";

import type { BrokerPortMessage } from "../broker/protocol";

jest.mock("embedding-sdk-bundle/sdk-bundle-exports", () => ({
  sdkBundleExports: {},
}));
jest.mock("./components/DataAppProvider/DataAppProvider", () => ({
  DataAppProvider: () => null,
}));

const HOST_ORIGIN = "https://mb.example.com";

describe("data-app iframe entry, on a subpath deployment", () => {
  const { fetch, history, MetabaseRoot } = window;
  const { pushState, replaceState } = history;

  afterEach(() => {
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: window,
    });
    window.fetch = fetch;
    history.pushState = pushState;
    history.replaceState = replaceState;
    window.MetabaseRoot = MetabaseRoot;
    history.replaceState({}, "", "/");
    document.body.replaceChildren();
  });

  it("requests the bundle under the subpath the document is served from", async () => {
    const hostPort = { postMessage: jest.fn<void, [BrokerPortMessage]>() };
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: jest.fn() },
    });
    window.MetabaseRoot = "/mb/";
    history.replaceState(
      {},
      "",
      `/mb/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}`,
    );
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    await act(async () => {
      await import("./app-data-app");
    });

    const init = new MessageEvent("message", {
      data: { type: DATA_APP_BROKER_INIT },
      origin: HOST_ORIGIN,
    });
    Object.defineProperties(init, {
      source: { value: window.parent },
      ports: { value: [hostPort] },
    });
    window.dispatchEvent(init);

    await waitFor(() => expect(hostPort.postMessage).toHaveBeenCalledTimes(1));
    const [message] = hostPort.postMessage.mock.calls[0];
    const path =
      message.type === "request" ? new URL(message.url).pathname : null;

    expect(path).toBe("/mb/api/ee/apps/sales/bundle");
  });
});
