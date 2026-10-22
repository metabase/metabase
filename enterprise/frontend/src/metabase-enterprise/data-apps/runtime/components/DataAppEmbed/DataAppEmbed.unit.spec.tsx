import type { ReactNode } from "react";

import { render, screen, waitFor } from "__support__/ui";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { useSdkIframeEmbedEventBus } from "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";

import { useDataAppBundle } from "../../lib/use-data-app-bundle";

import { DataAppEmbed } from "./DataAppEmbed";

jest.mock("../../lib/use-data-app-bundle");

jest.mock(
  "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus",
);

jest.mock("embedding-sdk-bundle/store", () => ({
  ...jest.requireActual("embedding-sdk-bundle/store"),
  useSdkSelector: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: jest.fn(
    ({ children }: { children: ReactNode }) => children,
  ),
}));

type Settings = Extract<
  SdkIframeEmbedSettings,
  { componentName: "metabase-data-app" }
>;

describe("DataAppEmbed", () => {
  const settings: Settings = {
    componentName: "metabase-data-app",
    path: "sales/orders?active=true",
    instanceUrl: window.location.origin,
    theme: { colors: { brand: "#ff0000" } },
  };

  const setupSettings = (overrides: Partial<Settings> = {}) => {
    jest.mocked(useSdkIframeEmbedEventBus).mockReturnValue({
      embedSettings: { ...settings, ...overrides },
      sendMessage: jest.fn(),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, "", "/embed/embedded-apps/sales");
    jest.spyOn(PLUGIN_EMBEDDING_IFRAME_SDK, "isEnabled").mockReturnValue(true);

    setupSettings();
    jest.mocked(useSdkSelector).mockReturnValue({ status: "success" });

    jest
      .mocked(useDataAppBundle)
      .mockReturnValue({ data: null, failed: false });
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    ensureMetabaseProviderPropsStore().cleanup();
    jest.restoreAllMocks();
  });

  it("waits for SSO initialization before mounting the bundle loader", () => {
    jest.mocked(useSdkSelector).mockReturnValue({ status: "loading" });

    render(<DataAppEmbed />);

    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it("renders the app with its own theme and SSO config", async () => {
    const appTheme = { colors: { brand: "#0000ff" } };

    jest.mocked(useDataAppBundle).mockReturnValue({
      failed: false,
      data: {
        component: () => <div>Orders app</div>,
        providerProps: { theme: appTheme },
      },
    });

    render(<DataAppEmbed />);

    expect(await screen.findByText("Orders app")).toBeInTheDocument();

    await waitFor(() =>
      expect(jest.mocked(ComponentProvider).mock.lastCall?.[0]).toMatchObject({
        authConfig: {
          isGuest: false,
          metabaseInstanceUrl: window.location.origin,
        },
        theme: appTheme,
      }),
    );

    expect(useDataAppBundle).toHaveBeenCalledWith("sales", { embedded: true });
    expect(document.querySelector("iframe")).toBeNull();
  });

  it.each([
    [{ isGuest: true }, "Guest embeds are not supported for data apps."],
    [
      { useExistingUserSession: true },
      "Embedded data apps require SSO authentication.",
    ],
  ])("rejects non-SSO settings: %p", (overrides, message) => {
    setupSettings(overrides);
    render(<DataAppEmbed />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  // TODO(DAT-18): add api key support for local development
  it.each([true, false])("rejects API keys on localhost: %s", (isLocalhost) => {
    setupSettings({ apiKey: "development-key", _isLocalhost: isLocalhost });
    render(<DataAppEmbed />);

    expect(
      screen.getByText("Embedded data apps require SSO authentication."),
    ).toBeInTheDocument();

    expect(ComponentProvider).not.toHaveBeenCalled();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it("waits for settings to arrive before starting auth", () => {
    jest
      .mocked(useSdkIframeEmbedEventBus)
      .mockReturnValue({ embedSettings: null, sendMessage: jest.fn() });

    render(<DataAppEmbed />);

    expect(ComponentProvider).not.toHaveBeenCalled();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it.each(["other/orders", "sales/../other", "sales/%00orders"])(
    "rejects mismatched and invalid app paths: %s",
    (path) => {
      setupSettings({ path });
      render(<DataAppEmbed />);

      expect(
        screen.getByText(
          "Something went wrong. Please refresh the page and try again.",
        ),
      ).toBeInTheDocument();

      expect(ComponentProvider).not.toHaveBeenCalled();
      expect(useDataAppBundle).not.toHaveBeenCalled();
    },
  );

  it("requires the embedding license before starting auth", () => {
    jest.spyOn(PLUGIN_EMBEDDING_IFRAME_SDK, "isEnabled").mockReturnValue(false);

    render(<DataAppEmbed />);

    expect(
      screen.getByText("A valid license is required for embedding."),
    ).toBeInTheDocument();

    expect(ComponentProvider).not.toHaveBeenCalled();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it("shows auth failures without loading the app", () => {
    jest
      .mocked(useSdkSelector)
      .mockReturnValue({ status: "error", error: { message: "SSO failed" } });

    render(<DataAppEmbed />);
    expect(screen.getByText("SSO failed")).toBeInTheDocument();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it("shows data app bundle errors inside the iframe", () => {
    jest
      .mocked(useDataAppBundle)
      .mockReturnValue({ data: null, failed: true, error: "Access denied" });

    render(<DataAppEmbed />);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
});
