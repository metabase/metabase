import { act, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { sdkBundleExports } from "embedding-sdk-bundle/sdk-bundle-exports";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { useMetabaseAuthStatus } from "embedding-sdk-package/hooks/public/use-metabase-auth-status";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";

import { DataApp } from "./DataApp";

jest.mock("embedding-sdk-package/hooks/public/use-metabase-auth-status");

const config = {
  metabaseInstanceUrl: "https://metabase.example.com/mb",
  preferredAuthMethod: "jwt" as const,
};
const session = { id: "sso-session", exp: 9999999999 };
const requestSession = jest.fn().mockResolvedValue(session);
const getSession = jest.fn(() => requestSession);

function message(
  iframe: HTMLIFrameElement,
  type: string,
  overrides: Partial<MessageEventInit> = {},
) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin: "https://metabase.example.com",
        data: { type },
        ...overrides,
      }),
    ),
  );
}

function setupProvider() {
  ensureMetabaseProviderPropsStore().setProps({
    authConfig: config,
    locale: "fr",
  });
  ensureMetabaseProviderPropsStore().updateInternalProps({
    reduxStore: getSdkStore(),
  });
}

describe("DataApp", () => {
  const originalBundle = window.METABASE_EMBEDDING_SDK_BUNDLE;

  afterEach(() => {
    window.METABASE_EMBEDDING_SDK_BUNDLE = originalBundle;
    act(() => ensureMetabaseProviderPropsStore().cleanup());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    requestSession.mockResolvedValue(session);
    jest.mocked(useMetabaseAuthStatus).mockReturnValue({ status: "success" });
    window.METABASE_EMBEDDING_SDK_BUNDLE = {
      ...sdkBundleExports,
      getDataAppSession: getSession,
    };
    setupProvider();
  });

  it("uses the modular runtime iframe with the initial path/query and sends only app settings", () => {
    render(<DataApp path="/boba-hq/orders?active=true" height={480} />);

    const iframe = screen.getByTitle<HTMLIFrameElement>("Data app");
    const url = new URL(iframe.src);
    expect(url.pathname).toBe("/mb/embed/embedded-apps/boba-hq/orders");
    expect(url.searchParams.get("active")).toBe("true");
    expect(iframe).toHaveStyle({ height: "480px" });
    expect(screen.getAllByTitle("Data app")).toHaveLength(1);

    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");
    message(iframe, "metabase.embed.iframeReady");

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "metabase.embed.setSettings",
        data: {
          componentName: "metabase-data-app",
          path: "boba-hq/orders?active=true",
          instanceUrl: config.metabaseInstanceUrl,
          locale: "fr",
          _embedReferrer: window.location.href,
        },
      },
      "https://metabase.example.com",
    );
  });

  it("requests the provider session again for iframe token refresh", async () => {
    render(<DataApp path="boba-hq" />);
    const iframe = screen.getByTitle<HTMLIFrameElement>("Data app");
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    message(iframe, "metabase.embed.requestSessionToken");
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: "metabase.embed.submitSessionToken",
          data: { sessionToken: session },
        },
        "https://metabase.example.com",
      ),
    );

    const refreshed = { ...session, id: "refreshed-session" };
    requestSession.mockResolvedValue(refreshed);
    message(iframe, "metabase.embed.requestSessionToken");
    await waitFor(() =>
      expect(postMessage).toHaveBeenLastCalledWith(
        {
          type: "metabase.embed.submitSessionToken",
          data: { sessionToken: refreshed },
        },
        "https://metabase.example.com",
      ),
    );
    expect(requestSession).toHaveBeenCalledTimes(2);
    expect(requestSession).toHaveBeenCalledWith(config);
  });

  it("rejects messages from another frame or origin before requesting credentials", () => {
    render(<DataApp path="boba-hq" />);
    const iframe = screen.getByTitle<HTMLIFrameElement>("Data app");
    message(iframe, "metabase.embed.requestSessionToken", {
      origin: "https://other.example.com",
    });
    message(iframe, "metabase.embed.requestSessionToken", { source: window });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("recreates the frame when its path changes and discards a pending session reply", async () => {
    let finish: (value: typeof session) => void = () => {};
    requestSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender, unmount } = render(<DataApp path="boba-hq" />);
    const first = screen.getByTitle<HTMLIFrameElement>("Data app");
    const postMessage = jest.spyOn(first.contentWindow!, "postMessage");
    message(first, "metabase.embed.requestSessionToken");

    rerender(<DataApp path="/boba-hq/orders?active=true" />);
    const next = screen.getByTitle<HTMLIFrameElement>("Data app");
    expect(next).not.toBe(first);
    await act(async () => finish(session));
    expect(postMessage).not.toHaveBeenCalled();

    unmount();
    message(next, "metabase.embed.requestSessionToken");
    expect(requestSession).toHaveBeenCalledTimes(1);
  });

  it("keeps the frame when only a leading slash changes", () => {
    const { rerender } = render(<DataApp path="boba-hq" />);
    const iframe = screen.getByTitle("Data app");
    rerender(<DataApp path="/boba-hq" />);
    expect(screen.getByTitle("Data app")).toBe(iframe);
  });

  it("keeps concurrent frames and their session replies separate", async () => {
    render(
      <>
        <DataApp path="sales" />
        <DataApp path="inventory" />
      </>,
    );
    const [sales, inventory] =
      screen.getAllByTitle<HTMLIFrameElement>("Data app");
    const salesMessage = jest.spyOn(sales.contentWindow!, "postMessage");
    const inventoryMessage = jest.spyOn(
      inventory.contentWindow!,
      "postMessage",
    );

    expect(new URL(sales.src).searchParams.get("embed-js-identifier")).not.toBe(
      new URL(inventory.src).searchParams.get("embed-js-identifier"),
    );

    message(sales, "metabase.embed.requestSessionToken");
    await waitFor(() =>
      expect(salesMessage).toHaveBeenCalledWith(
        {
          type: "metabase.embed.submitSessionToken",
          data: { sessionToken: session },
        },
        "https://metabase.example.com",
      ),
    );
    expect(inventoryMessage).not.toHaveBeenCalled();
  });

  it("reports an incompatible instance bundle", async () => {
    window.METABASE_EMBEDDING_SDK_BUNDLE = {
      ...sdkBundleExports,
      getDataAppSession: undefined,
    };
    render(<DataApp path="sales" />);

    message(
      screen.getByTitle<HTMLIFrameElement>("Data app"),
      "metabase.embed.requestSessionToken",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This instance does not support React data app embeds.",
    );
  });

  it("discards a pending session result after unmount", async () => {
    let finish: (value: typeof session) => void = () => {};
    requestSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(<DataApp path="sales" />);
    const iframe = screen.getByTitle<HTMLIFrameElement>("Data app");
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    message(iframe, "metabase.embed.requestSessionToken");
    unmount();
    await act(async () => finish(session));

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("renders an empty fallback on the server before reading provider state", () => {
    expect(renderToString(<DataApp path="sales" />)).toBe("");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("waits for the provider to authenticate", () => {
    jest.mocked(useMetabaseAuthStatus).mockReturnValue({ status: "loading" });
    render(<DataApp path="boba-hq" />);
    expect(screen.queryByTitle("Data app")).not.toBeInTheDocument();
  });

  it("rejects API keys before creating a frame", () => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        metabaseInstanceUrl: config.metabaseInstanceUrl,
        apiKey: "development-key",
      },
    });

    render(<DataApp path="boba-hq" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Data app embeds require SSO authentication.",
    );
    expect(screen.queryByTitle("Data app")).not.toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects guest providers", () => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        metabaseInstanceUrl: config.metabaseInstanceUrl,
        isGuest: true,
      },
    });

    render(<DataApp path="boba-hq" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Data app embeds require SSO authentication.",
    );
    expect(screen.queryByTitle("Data app")).not.toBeInTheDocument();
  });

  it("shows session refresh errors", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });
    render(<DataApp path="boba-hq" />);
    message(
      screen.getByTitle<HTMLIFrameElement>("Data app"),
      "metabase.embed.requestSessionToken",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SSO is unavailable",
    );
  });

  it("rejects a path that escapes the app", () => {
    render(<DataApp path="boba-hq/../other" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A valid data app path must be provided.",
    );
    expect(screen.queryByTitle("Data app")).not.toBeInTheDocument();
  });
});
