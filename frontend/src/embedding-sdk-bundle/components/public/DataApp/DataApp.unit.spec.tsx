import {
  act,
  render as renderWithoutProviders,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";

import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-bundle/lib/provider-props-store";
import { getSdkStore } from "embedding-sdk-bundle/store";
import {
  PLUGIN_EMBEDDING_SDK_AUTH,
  initAuth,
} from "embedding-sdk-bundle/store/auth";
import {
  setErrorComponent,
  setPluginsReady,
} from "embedding-sdk-bundle/store/reducer";
import { MetabaseReduxProvider } from "metabase/redux";
import { defer } from "metabase/utils/promise";

import { DataApp, type DataAppProps } from "./DataApp";

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

const message = (
  iframe: HTMLIFrameElement,
  type: string,
  overrides: Partial<MessageEventInit> = {},
) =>
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin: ORIGIN,
        data: { type },
        ...overrides,
      }),
    ),
  );

const pathChangeMessage = (
  iframe: HTMLIFrameElement,
  path: unknown,
  overrides: Partial<MessageEventInit> = {},
) =>
  message(iframe, "metabase.embed.dataAppPathChange", {
    data: { type: "metabase.embed.dataAppPathChange", data: { path } },
    ...overrides,
  });

function HostWithPathState() {
  const [path, setPath] = useState("boba-hq");

  return (
    <>
      <p data-testid="host-path">{path}</p>
      <button onClick={() => setPath("boba-hq")}>Home</button>
      <DataApp path={path} onPathChange={setPath} />
    </>
  );
}

function setup(props: DataAppProps = { path: "boba-hq" }) {
  const view = render(<DataApp {...props} />);
  const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
  const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

  return { ...view, iframe, postMessage };
}

describe("DataApp", () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      settingsMessage("boba-hq/orders?active=true"),
      ORIGIN,
    );
  });

  it("sends the latest path once the iframe is ready after a route change", () => {
    const { iframe, postMessage, rerender } = setup();

    rerender(<DataApp path="boba-hq/orders" />);
    expect(postMessage).not.toHaveBeenCalled();

    message(iframe, "metabase.embed.iframeReady");

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      settingsMessage("boba-hq/orders"),
      ORIGIN,
    );
  });

  it("lets the host navigate back after the user navigates inside the app", async () => {
    render(<HostWithPathState />);

    const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    message(iframe, "metabase.embed.iframeReady");
    pathChangeMessage(iframe, "boba-hq/orders/42?tab=items");

    expect(screen.getByTestId("host-path")).toHaveTextContent(
      "boba-hq/orders/42?tab=items",
    );

    postMessage.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Home" }));

    // the iframe still has `boba-hq` from its first settings, so it also needs a navigation request
    expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    expect(postMessage.mock.calls).toEqual([
      [settingsMessage("boba-hq"), ORIGIN],
      [
        {
          type: "metabase.embed.navigateToDataAppPath",
          data: { path: "boba-hq" },
        },
        ORIGIN,
      ],
    ]);
  });

  it("ignores path changes from another origin", () => {
    render(<HostWithPathState />);

    const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");

    pathChangeMessage(iframe, "boba-hq/orders", {
      origin: "https://other.example.com",
    });

    expect(screen.getByTestId("host-path")).toHaveTextContent(/^boba-hq$/);
  });

  it.each(["boba-hq/customers/acme%2Feu", "boba-hq/notes#a\\b", "other-app"])(
    "ignores a reported path that `path` rejects or that names another app: %s",
    (reportedPath) => {
      render(<HostWithPathState />);

      const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");

      message(iframe, "metabase.embed.iframeReady");
      pathChangeMessage(iframe, reportedPath);

      expect(screen.getByTestId("host-path")).toHaveTextContent(/^boba-hq$/);
      expect(screen.getByTestId("data-app-frame")).toBe(iframe);
    },
  );

  it("does not send an older reported path back to the app after a newer report", () => {
    render(<HostWithPathState />);

    const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    message(iframe, "metabase.embed.iframeReady");
    postMessage.mockClear();

    pathChangeMessage(iframe, "boba-hq/orders");
    pathChangeMessage(iframe, "boba-hq/orders/list");

    expect(screen.getByTestId("host-path")).toHaveTextContent(
      "boba-hq/orders/list",
    );
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("sends new settings at a reported path when the locale changes", () => {
    render(<HostWithPathState />);

    const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
    const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

    message(iframe, "metabase.embed.iframeReady");
    pathChangeMessage(iframe, "boba-hq/orders");
    postMessage.mockClear();

    act(() =>
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: CONFIG,
        locale: "de",
      }),
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "metabase.embed.setSettings",
        data: expect.objectContaining({ path: "boba-hq/orders", locale: "de" }),
      }),
      ORIGIN,
    );
  });

  it("does not call onPathChange for a path change message without a string path", () => {
    const onPathChange = jest.fn<void, [string]>();
    const onError = jest.fn((event: ErrorEvent) => event.preventDefault());
    window.addEventListener("error", onError);

    try {
      const { iframe } = setup({ path: "boba-hq", onPathChange });

      pathChangeMessage(iframe, 42);
      message(iframe, "metabase.embed.dataAppPathChange");
    } finally {
      window.removeEventListener("error", onError);
    }

    expect(onError).not.toHaveBeenCalled();
    expect(onPathChange).not.toHaveBeenCalled();
  });

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

  it.each([
    { name: "guest embeds", auth: { isGuest: true as const } },

    // TODO(DAT-18): support API keys for local development
    { name: "an API key", auth: { apiKey: "development-key" } },
  ])("does not load the iframe with $name", ({ auth }) => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        metabaseInstanceUrl: CONFIG.metabaseInstanceUrl,
        ...auth,
      },
    });

    render(<DataApp path="boba-hq" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Guest embedding and API keys are not supported for data apps.",
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

    // going back to the route that failed keeps the working iframe
    rerender(<DataApp path="boba-hq/orders" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("data-app-frame")).toBe(nextIframe);
  });

  it("shows an error when the provider cannot refresh the session", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    const { iframe } = setup();
    message(iframe, "metabase.embed.requestSessionToken");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SSO is unavailable",
    );
  });
});
