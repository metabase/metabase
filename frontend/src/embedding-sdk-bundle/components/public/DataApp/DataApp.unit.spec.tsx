jest.mock("embedding-sdk-bundle/analytics/event", () => ({
  ...jest.requireActual("embedding-sdk-bundle/analytics/event"),
  trackSdkSimpleEvent: jest.fn(),
}));

import {
  act,
  render as renderWithoutProviders,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, type ReactNode, useState } from "react";

import { renderWithProviders } from "__support__/ui";
import { trackSdkSimpleEvent } from "embedding-sdk-bundle/analytics/event";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { getIsLocalhost } from "embedding-sdk-bundle/lib/get-is-localhost";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-bundle/lib/provider-props-store";
import { getSdkStore, sdkReducers } from "embedding-sdk-bundle/store";
import {
  PLUGIN_EMBEDDING_SDK_AUTH,
  initAuth,
} from "embedding-sdk-bundle/store/auth";
import {
  setErrorComponent,
  setPluginsReady,
} from "embedding-sdk-bundle/store/reducer";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { MetabaseReduxProvider } from "metabase/redux";
import { defer } from "metabase/utils/promise";
import { createMockSettings } from "metabase-types/api/mocks";

import { DataApp, type DataAppProps } from "./DataApp";

jest.mock("embedding-sdk-bundle/lib/get-is-localhost");

const CONFIG = {
  metabaseInstanceUrl: "https://metabase.example.com/mb",
  preferredAuthMethod: "jwt" as const,
};

const ORIGIN = "https://metabase.example.com";
const SESSION = { id: "sso-session", exp: 9999999999 };

let requestSession: jest.SpiedFunction<
  typeof PLUGIN_EMBEDDING_SDK_AUTH.getOrRefreshSession
>;

let store = getSdkStore();

const render = (ui: ReactNode) =>
  renderWithoutProviders(ui, {
    wrapper: ({ children }) => (
      <MetabaseReduxProvider store={store}>
        <SdkThemeProvider>{children}</SdkThemeProvider>
      </MetabaseReduxProvider>
    ),
  });

const sessionMessage = (sessionToken = SESSION) => ({
  type: "metabase.embed.submitSessionToken",
  data: { authMethod: "provider-managed", sessionToken },
});

const settingsMessage = (path: string) => ({
  type: "metabase.embed.setSettings",
  data: {
    componentName: "metabase-data-app",
    path,
    instanceUrl: CONFIG.metabaseInstanceUrl,
    locale: "fr",
    _embedReferrer: window.location.href,
  },
});

const navigateMessage = (
  path: string,
  navigationId: unknown = expect.any(Number),
) => ({
  type: "metabase.embed.navigateToDataAppPath",
  data: { path, navigationId },
});

const messageEvent = (
  iframe: HTMLIFrameElement,
  type: string,
  overrides: Partial<MessageEventInit> = {},
) =>
  new MessageEvent("message", {
    source: iframe.contentWindow,
    origin: ORIGIN,
    data: { type },
    ...overrides,
  });

const message = (...args: Parameters<typeof messageEvent>) =>
  act(() => window.dispatchEvent(messageEvent(...args)));

const pathChangeMessage = (
  iframe: HTMLIFrameElement,
  path: unknown,
  navigationId?: number,
) =>
  message(iframe, "metabase.embed.dataAppPathChange", {
    data: {
      type: "metabase.embed.dataAppPathChange",
      data: { path, navigationId },
    },
  });

const getNavigationId = (postMessage: jest.SpyInstance) => {
  const [lastMessage] = postMessage.mock.lastCall ?? [];
  return lastMessage?.data?.navigationId;
};

function HostWithPathState() {
  const [path, setPath] = useState("boba-hq");

  return (
    <>
      <p data-testid="host-path">{path}</p>
      <button onClick={() => setPath("boba-hq")}>Home</button>
      <button onClick={() => setPath("boba-hq/orders/42")}>Orders</button>
      <DataApp path={path} onPathChange={setPath} />
    </>
  );
}

function renderFrame(ui: ReactElement) {
  const view = render(ui);
  const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
  const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

  return { ...view, iframe, postMessage };
}

const setup = (props: DataAppProps = { path: "boba-hq" }) =>
  renderFrame(<DataApp {...props} />);

const setupHost = () => renderFrame(<HostWithPathState />);

describe("DataApp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getIsLocalhost).mockReturnValue(true);

    requestSession = jest
      .spyOn(PLUGIN_EMBEDDING_SDK_AUTH, "getOrRefreshSession")
      .mockResolvedValue(SESSION);

    store = getSdkStore();
    store.dispatch(initAuth.fulfilled(undefined, "test", CONFIG));
    store.dispatch(setPluginsReady(true));

    ensureMetabaseProviderPropsStore().setProps({
      authConfig: CONFIG,
      locale: "fr",
    });

    ensureMetabaseProviderPropsStore().updateInternalProps({
      reduxStore: store,
    });
  });

  afterEach(() => {
    act(() => ensureMetabaseProviderPropsStore().cleanup());
    requestSession.mockRestore();
  });

  it("loads the app at the given path and sends its settings", () => {
    const { iframe, postMessage } = setup({
      path: "/boba-hq/orders?active=true",
      height: 480,
    });

    const url = new URL(iframe.src);
    expect(url.pathname).toBe("/mb/embed/embedded-apps/boba-hq/orders");
    expect(url.searchParams.get("active")).toBe("true");
    expect(iframe).toHaveStyle({ height: "480px" });

    message(iframe, "metabase.embed.iframeReady");

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "metabase.embed.setSettings",
        data: {
          componentName: "metabase-data-app",
          path: "boba-hq/orders?active=true",
          instanceUrl: CONFIG.metabaseInstanceUrl,
          locale: "fr",
          _embedReferrer: window.location.href,
        },
      },
      ORIGIN,
    );
  });

  it("ignores session token requests from another event source or origin", () => {
    const { iframe } = setup();

    message(iframe, "metabase.embed.requestSessionToken", {
      source: window,
    });

    message(iframe, "metabase.embed.requestSessionToken", {
      origin: "https://other.example.com",
    });

    expect(requestSession).not.toHaveBeenCalled();
  });

  it.each([
    { name: "a locale change", props: { locale: "de" } },
    {
      name: "a theme change with the same auth settings",
      props: {
        // change the dependency so the auth effect is run again
        authConfig: { ...CONFIG },
        theme: { colors: { brand: "#123456" } },
      },
    },
  ])("delivers the pending session reply after $name", async ({ props }) => {
    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);

    const { iframe, postMessage } = setup();

    message(iframe, "metabase.embed.requestSessionToken");

    act(() =>
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: CONFIG,
        locale: "fr",
        ...props,
      }),
    );

    expect(screen.queryByTestId("data-app-frame")).toBe(iframe);

    await act(async () => pending.resolve(SESSION));
    expect(postMessage).toHaveBeenCalledWith(sessionMessage(), ORIGIN);
  });

  it("ignores stale session requests with older auth config", async () => {
    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);

    const { iframe, postMessage } = setup();

    const nextConfig = {
      ...CONFIG,
      jwtProviderUri: "https://host.example.com/next-jwt",
    };

    message(iframe, "metabase.embed.requestSessionToken");
    expect(requestSession).toHaveBeenCalledWith(CONFIG, store);

    act(() =>
      ensureMetabaseProviderPropsStore().setProps({ authConfig: nextConfig }),
    );

    expect(screen.queryByTestId("data-app-frame")).toBe(iframe);

    // stale request should not be replied to - it was made with the old auth config
    await act(async () => pending.resolve(SESSION));
    expect(postMessage).not.toHaveBeenCalled();

    const nextSession = { ...SESSION, id: "next-session" };
    requestSession.mockResolvedValueOnce(nextSession);
    message(iframe, "metabase.embed.requestSessionToken");

    // new session request uses the updated auth config
    expect(requestSession).toHaveBeenLastCalledWith(nextConfig, store);

    await waitFor(() =>
      // sends the new session back to the iframe
      expect(postMessage).toHaveBeenCalledWith(
        sessionMessage(nextSession),
        ORIGIN,
      ),
    );
  });

  it("reloads the iframe when the app slug changes and ignores its old session reply", async () => {
    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);
    const { iframe, postMessage, rerender } = setup();

    message(iframe, "metabase.embed.requestSessionToken");
    rerender(<DataApp path="/milk-tea-hq/orders" />);
    expect(screen.queryByTestId("data-app-frame")).not.toBe(iframe);

    // ignores old session replies
    await act(async () => pending.resolve(SESSION));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("keeps the iframe and sends the new path when only the route or query changes", () => {
    const { iframe, postMessage, rerender } = setup();
    const initialSrc = iframe.src;

    message(iframe, "metabase.embed.iframeReady");
    postMessage.mockClear();

    rerender(<DataApp path="boba-hq/orders?active=true" />);

    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(iframe.src).toBe(initialSrc);
    expect(postMessage.mock.calls).toEqual([
      [navigateMessage("boba-hq/orders?active=true"), ORIGIN],
    ]);
  });

  it("ignores later changes to initialPath, including a new app slug", () => {
    const { iframe, postMessage, rerender } = setup({ initialPath: "boba-hq" });

    message(iframe, "metabase.embed.iframeReady");
    postMessage.mockClear();

    for (const initialPath of ["boba-hq/orders", "milk-tea-hq/orders"]) {
      rerender(<DataApp initialPath={initialPath} />);
      expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    }
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("calls onPathChange with initialPath and never navigates the app", () => {
    const onPathChange = jest.fn<void, [string]>();
    const { iframe, postMessage } = setup({
      initialPath: "boba-hq",
      onPathChange,
    });

    message(iframe, "metabase.embed.iframeReady");
    postMessage.mockClear();

    pathChangeMessage(iframe, "boba-hq/orders/42?tab=items");
    // a page that `path` rejects is not reported, and the app stays on it
    pathChangeMessage(iframe, "boba-hq/customers/acme%2Feu");

    expect(onPathChange.mock.calls).toEqual([["boba-hq/orders/42?tab=items"]]);
    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("stays on the last path when path is removed", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { iframe, postMessage, rerender } = setup({ initialPath: "boba-hq" });

    message(iframe, "metabase.embed.iframeReady");

    rerender(<DataApp initialPath="boba-hq" path="boba-hq/orders/42" />);
    expect(postMessage).toHaveBeenLastCalledWith(
      navigateMessage("boba-hq/orders/42"),
      ORIGIN,
    );
    postMessage.mockClear();

    rerender(<DataApp initialPath="boba-hq" />);

    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it("uses path and warns when initialPath is also set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { iframe } = setup({ initialPath: "milk-tea-hq", path: "boba-hq" });

    expect(new URL(iframe.src).pathname).toBe(
      "/mb/embed/embedded-apps/boba-hq",
    );
    expect(warn).toHaveBeenCalledWith(
      "`initialPath` is ignored when `path` is set. Pass only one.",
    );

    warn.mockRestore();
  });

  it("navigates to the latest path once the iframe is ready after a route change", () => {
    const { iframe, postMessage, rerender } = setup();

    rerender(<DataApp path="boba-hq/orders" />);
    expect(postMessage).not.toHaveBeenCalled();

    message(iframe, "metabase.embed.iframeReady");

    expect(postMessage.mock.calls).toEqual([
      [settingsMessage("boba-hq"), ORIGIN],
      [navigateMessage("boba-hq/orders"), ORIGIN],
    ]);
  });

  it("resends the settings without moving the app when the locale changes", () => {
    const { iframe, postMessage, rerender } = setup();

    message(iframe, "metabase.embed.iframeReady");
    rerender(<DataApp path="boba-hq/orders" />);
    postMessage.mockClear();

    act(() =>
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: CONFIG,
        locale: "de",
      }),
    );

    expect(postMessage.mock.calls).toEqual([
      [
        {
          ...settingsMessage("boba-hq"),
          data: { ...settingsMessage("boba-hq").data, locale: "de" },
        },
        ORIGIN,
      ],
    ]);
  });

  it("lets the host navigate back after the user navigates inside the app", async () => {
    const { iframe, postMessage } = setupHost();

    message(iframe, "metabase.embed.iframeReady");
    pathChangeMessage(iframe, "boba-hq/orders/42?tab=items");

    expect(screen.getByTestId("host-path")).toHaveTextContent(
      "boba-hq/orders/42?tab=items",
    );

    postMessage.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Home" }));

    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage.mock.calls).toEqual([
      [navigateMessage("boba-hq"), ORIGIN],
    ]);
  });

  it("sends the app back to the host's path when it reports a page that `path` rejects", () => {
    const { iframe, postMessage } = setupHost();

    message(iframe, "metabase.embed.iframeReady");
    postMessage.mockClear();

    pathChangeMessage(iframe, "boba-hq/customers/acme%2Feu");

    expect(screen.getByTestId("host-path")).toHaveTextContent(/^boba-hq$/);
    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage.mock.calls).toEqual([
      [navigateMessage("boba-hq"), ORIGIN],
    ]);
  });

  it("does not send echoes back when the host applies reported paths later", () => {
    const reportedPaths: string[] = [];
    let setHostPath: (path: string) => void = () => {};

    function HostWithLatePathUpdates() {
      const [path, setPath] = useState("boba-hq");
      setHostPath = setPath;

      return (
        <DataApp
          path={path}
          onPathChange={(path) => reportedPaths.push(path)}
        />
      );
    }

    const { iframe, postMessage } = renderFrame(<HostWithLatePathUpdates />);

    message(iframe, "metabase.embed.iframeReady");
    postMessage.mockClear();

    pathChangeMessage(iframe, "boba-hq/orders");
    pathChangeMessage(iframe, "boba-hq/orders/latest");

    // e.g. a router that applies each navigation a moment later
    for (const path of reportedPaths) {
      act(() => setHostPath(path));
    }

    expect(postMessage).not.toHaveBeenCalled();

    // the host can still navigate to an earlier page afterwards
    act(() => setHostPath("boba-hq/orders"));

    expect(postMessage.mock.calls).toEqual([
      [navigateMessage("boba-hq/orders"), ORIGIN],
    ]);
  });

  it("navigates to a page the app left before the host rendered its reports", async () => {
    const { iframe, postMessage } = setupHost();

    message(iframe, "metabase.embed.iframeReady");

    // e.g. a page that redirects straight back, with both reports rendered together
    act(() => {
      for (const path of ["boba-hq/orders/42", "boba-hq"]) {
        window.dispatchEvent(
          messageEvent(iframe, "metabase.embed.dataAppPathChange", {
            data: { type: "metabase.embed.dataAppPathChange", data: { path } },
          }),
        );
      }
    });

    postMessage.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Orders" }));

    expect(postMessage.mock.calls).toEqual([
      [navigateMessage("boba-hq/orders/42"), ORIGIN],
    ]);
  });

  it("navigates to path when the host starts passing it after the user navigated", () => {
    const { iframe, postMessage, rerender } = setup({
      initialPath: "boba-hq",
    });

    message(iframe, "metabase.embed.iframeReady");
    pathChangeMessage(iframe, "boba-hq/orders");
    postMessage.mockClear();

    rerender(<DataApp path="boba-hq" />);

    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage.mock.calls).toEqual([
      [navigateMessage("boba-hq"), ORIGIN],
    ]);
  });

  it("ignores a report sent before the iframe handled the host's latest navigation", async () => {
    const { iframe, postMessage } = setupHost();

    message(iframe, "metabase.embed.iframeReady");
    await userEvent.click(screen.getByRole("button", { name: "Orders" }));
    const navigationId = getNavigationId(postMessage);

    // the user clicked an in-app link before the iframe handled the host's navigation
    pathChangeMessage(iframe, "boba-hq/products");
    expect(screen.getByTestId("host-path")).toHaveTextContent(
      "boba-hq/orders/42",
    );

    // a click after the iframe handled it is reported
    pathChangeMessage(iframe, "boba-hq/customers", navigationId);
    expect(screen.getByTestId("host-path")).toHaveTextContent(
      "boba-hq/customers",
    );
  });

  it.each([
    { name: "with onPathChange", onPathChange: jest.fn<void, [string]>() },
    { name: "without onPathChange", onPathChange: undefined },
  ])(
    "sends a page the app reported when the host goes back to it after navigating elsewhere ($name)",
    ({ onPathChange }) => {
      const { iframe, postMessage, rerender } = setup({
        path: "boba-hq",
        onPathChange,
      });

      message(iframe, "metabase.embed.iframeReady");
      pathChangeMessage(iframe, "boba-hq/orders");
      rerender(<DataApp path="boba-hq/products" onPathChange={onPathChange} />);
      postMessage.mockClear();

      rerender(<DataApp path="boba-hq/orders" onPathChange={onPathChange} />);

      expect(postMessage).toHaveBeenCalledWith(
        navigateMessage("boba-hq/orders"),
        ORIGIN,
      );
    },
  );

  it("keeps the same iframe when a leading slash is added", () => {
    const { iframe, rerender } = setup();
    rerender(<DataApp path="/boba-hq" />);

    expect(screen.queryByTestId("data-app-frame")).toBe(iframe);
  });

  it("replies only to the iframe that requested a session", async () => {
    render(
      <>
        <DataApp path="sales" />
        <DataApp path="orders" />
      </>,
    );

    const [sales, orders] =
      screen.getAllByTestId<HTMLIFrameElement>("data-app-frame");

    const salesMessage = jest.spyOn(sales.contentWindow!, "postMessage");
    const ordersMessage = jest.spyOn(orders.contentWindow!, "postMessage");

    message(sales, "metabase.embed.requestSessionToken");
    expect(requestSession).toHaveBeenCalledWith(CONFIG, store);

    await waitFor(() =>
      // sales iframe should receive a session reply
      expect(salesMessage).toHaveBeenCalledWith(sessionMessage(), ORIGIN),
    );

    // orders iframe should not receive a session reply
    expect(ordersMessage).not.toHaveBeenCalled();
  });

  it("gives each iframe a different ID for parallel loading", () => {
    render(
      <>
        <DataApp path="sales" />
        <DataApp path="sales" />
      </>,
    );

    const [first, second] =
      screen.getAllByTestId<HTMLIFrameElement>("data-app-frame");

    const idOf = (iframe: HTMLIFrameElement) =>
      new URL(iframe.src).searchParams.get("embed-js-identifier");

    expect(idOf(first)).not.toBeNull();
    expect(idOf(second)).not.toBeNull();
    expect(idOf(first)).not.toBe(idOf(second));
  });

  it("ignores session requests after the component is removed", async () => {
    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);

    const { iframe, postMessage, unmount } = setup();
    message(iframe, "metabase.embed.requestSessionToken");
    unmount();

    await act(async () => pending.resolve(SESSION));
    message(iframe, "metabase.embed.requestSessionToken");

    expect(postMessage).not.toHaveBeenCalled();

    // the second request after unmount is ignored
    expect(requestSession).toHaveBeenCalledTimes(1);
  });

  it("delivers the pending session when the callback changes", async () => {
    const authConfig = {
      ...CONFIG,
      fetchRequestToken: async () => ({ jwt: "same-user-jwt" }),
    };

    ensureMetabaseProviderPropsStore().setProps({ authConfig });

    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);

    const { iframe, postMessage } = setup();
    message(iframe, "metabase.embed.requestSessionToken");

    // change the fetchRequestToken function in MetabaseProvider
    act(() =>
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: {
          ...authConfig,
          fetchRequestToken: async () => ({ jwt: "same-user-jwt" }),
        },
      }),
    );

    // resolve the pending request
    await act(async () => pending.resolve(SESSION));

    // session reply should still be delivered after fetchRequestToken callback changes
    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage).toHaveBeenCalledWith(sessionMessage(), ORIGIN);
    expect(requestSession).toHaveBeenCalledTimes(1);
  });

  it("shows the custom error without loading the iframe for an invalid path", () => {
    store.dispatch(
      setErrorComponent(({ message }) => (
        <span data-testid="custom-error">{message}</span>
      )),
    );

    render(<DataApp path="boba-hq/../other" />);

    expect(screen.getByTestId("custom-error")).toHaveTextContent(
      "A valid data app path must be provided.",
    );

    expect(screen.queryByTestId("data-app-frame")).not.toBeInTheDocument();
    expect(requestSession).not.toHaveBeenCalled();
  });

  it("does not load the iframe for guest embeds", () => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        metabaseInstanceUrl: CONFIG.metabaseInstanceUrl,
        isGuest: true,
      },
    });
    render(<DataApp path="boba-hq" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Guest embeds are not supported for data apps.",
    );
    expect(screen.queryByTestId("data-app-frame")).not.toBeInTheDocument();
    expect(requestSession).not.toHaveBeenCalled();
  });

  it("shows an error when the provider returns no session", async () => {
    requestSession.mockResolvedValueOnce(null);

    const { iframe, postMessage } = setup();
    message(iframe, "metabase.embed.requestSessionToken");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to authenticate this data app.",
    );

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("loads the iframe again and retries authentication after an error when the route changes", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    const { iframe, rerender } = setup({ path: "boba-hq/orders" });
    message(iframe, "metabase.embed.requestSessionToken");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    rerender(<DataApp path="boba-hq/products" />);
    const nextIframe =
      await screen.findByTestId<HTMLIFrameElement>("data-app-frame");
    const postMessage = jest.spyOn(nextIframe.contentWindow!, "postMessage");
    message(nextIframe, "metabase.embed.requestSessionToken");
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(sessionMessage(), ORIGIN),
    );
  });

  it("keeps the new iframe when going back to the route that failed before it authenticates", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    const { iframe, rerender } = setup({ path: "boba-hq/orders" });
    message(iframe, "metabase.embed.requestSessionToken");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    rerender(<DataApp path="boba-hq/products" />);
    const nextIframe =
      await screen.findByTestId<HTMLIFrameElement>("data-app-frame");

    rerender(<DataApp path="boba-hq/orders" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("data-app-frame")).toBe(nextIframe);
  });

  it("opens the host's path in the iframe loaded after an error", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    const { iframe, rerender } = setup({ path: "boba-hq" });
    message(iframe, "metabase.embed.iframeReady");

    // the user navigates inside the app, and this host does not mirror it in `path`
    pathChangeMessage(iframe, "boba-hq/orders");

    message(iframe, "metabase.embed.requestSessionToken");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    rerender(<DataApp path="boba-hq/orders" />);
    const nextIframe =
      await screen.findByTestId<HTMLIFrameElement>("data-app-frame");
    const postMessage = jest.spyOn(nextIframe.contentWindow!, "postMessage");
    message(nextIframe, "metabase.embed.iframeReady");

    expect(postMessage.mock.calls).toEqual([
      [settingsMessage("boba-hq"), ORIGIN],
      [navigateMessage("boba-hq/orders"), ORIGIN],
    ]);
  });

  it("loads a new iframe when authentication fails before a route change renders", async () => {
    let setHostPath: (path: string) => void = () => {};

    function HostWithPathSetter() {
      const [path, setPath] = useState("boba-hq");
      setHostPath = setPath;

      return <DataApp path={path} />;
    }

    const { iframe } = renderFrame(<HostWithPathSetter />);
    message(iframe, "metabase.embed.iframeReady");

    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    // the route change has not rendered when authentication fails
    await act(async () => {
      window.dispatchEvent(
        messageEvent(iframe, "metabase.embed.requestSessionToken"),
      );
      setHostPath("boba-hq/orders/42");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const nextIframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
    expect(nextIframe).not.toBe(iframe);

    const postMessage = jest.spyOn(nextIframe.contentWindow!, "postMessage");
    message(nextIframe, "metabase.embed.iframeReady");

    expect(postMessage).toHaveBeenCalledWith(
      navigateMessage("boba-hq/orders/42"),
      ORIGIN,
    );
  });

  it("shows an error when the provider cannot refresh the session", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    const { iframe } = setup();
    message(iframe, "metabase.embed.requestSessionToken");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SSO is unavailable",
    );
  });

  it("accepts an API key in localhost without requesting SSO session", () => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        metabaseInstanceUrl: CONFIG.metabaseInstanceUrl,
        apiKey: "development-key",
      },
    });

    const { iframe, postMessage } = setup({ path: "sales" });

    message(iframe, "metabase.embed.iframeReady");
    message(iframe, "metabase.embed.requestSessionToken");

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "metabase.embed.setSettings",
        data: expect.objectContaining({ apiKey: "development-key" }),
      },
      ORIGIN,
    );

    expect(iframe.src).not.toContain("development-key");
    expect(requestSession).not.toHaveBeenCalled();
  });

  it("shows an error when using API keys outside localhost", () => {
    jest.mocked(getIsLocalhost).mockReturnValue(false);

    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        metabaseInstanceUrl: CONFIG.metabaseInstanceUrl,
        apiKey: "development-key",
      },
    });

    render(<DataApp path="sales" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Using an API key in production is not allowed.",
    );

    expect(screen.queryByTestId("data-app-frame")).not.toBeInTheDocument();
    expect(requestSession).not.toHaveBeenCalled();
  });

  describe("analytics", () => {
    const COMPONENT_EVENT = {
      event: "embedding_sdk_component_rendered",
      detail: expect.objectContaining({ component: "DataApp", properties: {} }),
    };

    const renderTracked = (ui: ReactElement) => {
      const { state } = setupSdkState({
        settingValues: createMockSettings({ "anon-tracking-enabled": true }),
        sdkState: createMockSdkState({
          initStatus: createMockLoginStatusState({ status: "success" }),
          sdkTrackerReady: true,
        }),
      });

      return renderWithProviders(ui, {
        storeInitialState: state,
        customReducers: sdkReducers,
      });
    };

    const getComponentEvents = () =>
      jest.mocked(trackSdkSimpleEvent).mock.calls.map(([event]) => {
        const detail: unknown = JSON.parse(event.event_detail ?? "{}");

        return { event: event.event, detail };
      });

    it("reports one component event per data app", () => {
      renderTracked(
        <>
          <DataApp path="tracked-store/orders" />
          <DataApp path="tracked-store/customers" />
          <DataApp path="tracked-crm" />
        </>,
      );

      // one event for each data app: tracked-store + tracked-crm
      expect(getComponentEvents()).toEqual([COMPONENT_EVENT, COMPONENT_EVENT]);
    });

    it("reports the new data app when the path changes to another app", () => {
      const { rerender } = renderTracked(
        <DataApp path="switched-from/orders" />,
      );
      expect(getComponentEvents()).toEqual([COMPONENT_EVENT]);

      rerender(<DataApp path="switched-from/customers" />);
      expect(getComponentEvents()).toEqual([COMPONENT_EVENT]);

      rerender(<DataApp path="switched-to" />);
      expect(getComponentEvents()).toEqual([COMPONENT_EVENT, COMPONENT_EVENT]);
    });

    it("does not report a data app with an invalid path", () => {
      renderTracked(<DataApp path="../not-an-app" />);

      expect(
        screen.getByText("A valid data app path must be provided."),
      ).toBeInTheDocument();
      expect(getComponentEvents()).toEqual([]);
    });
  });
});
