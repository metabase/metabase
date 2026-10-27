import { act, waitFor } from "@testing-library/react";

import {
  DATA_APP_BROKER_INIT,
  DATA_APP_IFRAME_BROKER_HASH_KEY,
} from "metabase-enterprise/data-apps/constants";

import type {
  BrokerPortMessage,
  BrokerResponseMessage,
} from "../broker/protocol";

jest.mock("embedding-sdk-bundle/sdk-bundle-exports", () => ({
  sdkBundleExports: {},
}));
jest.mock("./components/DataAppProvider/DataAppProvider", () => ({
  DataAppProvider: () => null,
}));

// Records the CSP in place when the bundle would run, and never runs it: the
// sandbox would distort jsdom's own window.
const mockPolicyAtInstantiation = jest.fn<void, [string | null]>();
jest.mock("./loader", () => ({
  ...jest.requireActual<object>("./loader"),
  instantiateDataAppBundle: () => {
    mockPolicyAtInstantiation(
      // eslint-disable-next-line testing-library/no-node-access -- meta tag isn't part of React tree
      document.head.querySelector<HTMLMetaElement>(
        'meta[http-equiv="Content-Security-Policy"]',
      )?.content ?? null,
    );
    return new Promise(() => {});
  },
}));

const HOST_ORIGIN = "https://mb.example.com";
const POLICY =
  "default-src 'none'; connect-src 'self' https://api.example.com;";

describe("data-app iframe entry, served from a separate isolated origin", () => {
  it("installs the app's CSP from the bundle response before running the bundle, since the isolated origin serves the document without the app's hosts", async () => {
    const hostPort: {
      onmessage: ((event: { data: BrokerResponseMessage }) => void) | null;
      postMessage: jest.Mock<void, [BrokerPortMessage]>;
    } = { onmessage: null, postMessage: jest.fn() };
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: jest.fn() },
    });
    window.history.replaceState(
      {},
      "",
      `/embed/apps/sales#${DATA_APP_IFRAME_BROKER_HASH_KEY}=${encodeURIComponent(HOST_ORIGIN)}`,
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
    const [request] = hostPort.postMessage.mock.calls[0];

    act(() => {
      hostPort.onmessage?.({
        data: {
          id: request.id,
          status: 200,
          statusText: "OK",
          headers: {
            "content-type": "application/javascript",
            "x-metabase-data-app-content-security-policy": POLICY,
          },
          body: new TextEncoder().encode("").buffer,
        },
      });
    });

    await waitFor(() =>
      expect(mockPolicyAtInstantiation).toHaveBeenCalledWith(POLICY),
    );
  });
});
