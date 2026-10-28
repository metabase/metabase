import {
  act,
  render as renderWithoutProviders,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";

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
import { getIsLocalhost } from "embedding-sdk-shared/lib/get-is-localhost";
import { MetabaseReduxProvider } from "metabase/redux";
import { defer } from "metabase/utils/promise";

import { DataApp, type DataAppProps } from "./DataApp";

jest.mock("embedding-sdk-shared/lib/get-is-localhost");

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

function setup(props: DataAppProps = { path: "boba-hq" }) {
  const view = render(<DataApp {...props} />);
  const iframe = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
  const postMessage = jest.spyOn(iframe.contentWindow!, "postMessage");

  return { ...view, iframe, postMessage };
}

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
          _isLocalhost: true,
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

  it("reloads the iframe when the path changes and ignores its old session reply", async () => {
    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);
    const { iframe, postMessage, rerender } = setup();

    message(iframe, "metabase.embed.requestSessionToken");
    rerender(<DataApp path="/boba-hq/orders?active=true" />);
    expect(screen.queryByTestId("data-app-frame")).not.toBe(iframe);

    // ignores old session replies
    await act(async () => pending.resolve(SESSION));
    expect(postMessage).not.toHaveBeenCalled();
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

  it("passes a local API key without requesting an SSO session", () => {
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
        data: expect.objectContaining({
          apiKey: "development-key",
          _isLocalhost: true,
        }),
      },
      ORIGIN,
    );
    expect(iframe.src).not.toContain("development-key");
    expect(requestSession).not.toHaveBeenCalled();
  });

  it("replaces the iframe and ignores a pending SSO reply when switching to an API key", async () => {
    const pending = defer<typeof SESSION>();
    requestSession.mockReturnValueOnce(pending.promise);
    const { iframe, postMessage } = setup({ path: "sales" });

    message(iframe, "metabase.embed.requestSessionToken");
    act(() =>
      ensureMetabaseProviderPropsStore().setProps({
        authConfig: {
          metabaseInstanceUrl: CONFIG.metabaseInstanceUrl,
          apiKey: "development-key",
        },
      }),
    );
    await act(async () => pending.resolve(SESSION));

    const next = screen.getByTestId<HTMLIFrameElement>("data-app-frame");
    expect(next).not.toBe(iframe);
    expect(next.src).not.toContain("development-key");
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not load the iframe with an API key outside localhost", () => {
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

  it("shows an error when the provider cannot refresh the session", async () => {
    requestSession.mockRejectedValueOnce({ message: "SSO is unavailable" });

    const { iframe } = setup();
    message(iframe, "metabase.embed.requestSessionToken");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SSO is unavailable",
    );
  });
});
