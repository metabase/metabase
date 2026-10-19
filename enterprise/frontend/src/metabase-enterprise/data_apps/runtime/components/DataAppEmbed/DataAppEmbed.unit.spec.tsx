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

jest.mock(
  "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus",
);
jest.mock("../../lib/use-data-app-bundle");
jest.mock("embedding-sdk-bundle/store", () => ({
  ...jest.requireActual("embedding-sdk-bundle/store"),
  useSdkSelector: jest.fn(),
}));
jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: jest.fn(
    ({ children }: { children: ReactNode }) => children,
  ),
}));

describe("DataAppEmbed", () => {
  const settings: Extract<
    SdkIframeEmbedSettings,
    { componentName: "metabase-data-app" }
  > = {
    componentName: "metabase-data-app",
    path: "sales/orders?active=true",
    instanceUrl: window.location.origin,
    theme: { colors: { brand: "#ff0000" } },
  };

  const setupSettings = (overrides: Partial<typeof settings> = {}) => {
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

  it("renders the existing app with its own theme and SSO configuration", async () => {
    const appTheme = { colors: { brand: "#0000ff" } };
    jest.mocked(useDataAppBundle).mockReturnValue({
      data: {
        component: () => <div>Orders app</div>,
        providerProps: { theme: appTheme },
      },
      failed: false,
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
    { isGuest: true },
    { apiKey: "key" },
    { useExistingUserSession: true },
  ])("rejects non-SSO settings: %p", (overrides) => {
    setupSettings(overrides);

    render(<DataAppEmbed />);

    expect(
      screen.getByText("Data app embeds require SSO authentication."),
    ).toBeInTheDocument();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it("shows authentication failures without loading the app", () => {
    jest
      .mocked(useSdkSelector)
      .mockReturnValue({ status: "error", error: { message: "SSO failed" } });

    render(<DataAppEmbed />);

    expect(screen.getByText("SSO failed")).toBeInTheDocument();
    expect(useDataAppBundle).not.toHaveBeenCalled();
  });

  it("shows bundle authorization errors inside the embedding iframe", () => {
    jest
      .mocked(useDataAppBundle)
      .mockReturnValue({ data: null, failed: true, error: "Access denied" });

    render(<DataAppEmbed />);

    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
});
