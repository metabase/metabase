import { act, waitFor } from "@testing-library/react";

import { mockSettings } from "__support__/settings";
import { DATA_APP_BROKER_INIT_MESSAGE_TYPE } from "metabase-enterprise/data-apps/constants";

import type { BrokerInitMessage, BrokerPortMessage } from "../broker/protocol";

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
    mockSettings();
    history.replaceState({}, "", "/");
    document.body.replaceChildren();
  });

  it("requests the bundle under the subpath the document is served from", async () => {
    const hostPort = { postMessage: jest.fn<void, [BrokerPortMessage]>() };
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: jest.fn<void, [unknown, string]>() },
    });
    window.MetabaseRoot = "/mb/";
    mockSettings({
      "isolated-origin": window.location.origin,
      "site-url": `${HOST_ORIGIN}/mb`,
    });
    history.replaceState({}, "", "/mb/embed/apps/sales");
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    await act(async () => {
      await import("./app-data-app");
    });

    const data: BrokerInitMessage = {
      type: DATA_APP_BROKER_INIT_MESSAGE_TYPE,
      locale: null,
    };
    const init = new MessageEvent("message", { data, origin: HOST_ORIGIN });
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
