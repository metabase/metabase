// Register mocks before loading the modules under test.
// oxfmt-ignore
import {
  cleanup,
  mockComponentProvider,
  mockUseDataAppBundle,
  mockUseSdkIframeEmbedEventBus,
  mockUseSdkSelector,
  setup,
  setupSettings,
} from "./tests/setup";

import { render, screen, waitFor } from "__support__/ui";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";

import { DataAppEmbed } from "./DataAppEmbed";

describe("DataAppEmbed", () => {
  beforeEach(setup);
  afterEach(cleanup);

  it("waits for SSO initialization before mounting the bundle loader", () => {
    mockUseSdkSelector.mockReturnValue({ status: "loading" });

    render(<DataAppEmbed />);

    expect(mockUseDataAppBundle).not.toHaveBeenCalled();
  });

  it("renders the app with its own theme and SSO config", async () => {
    const appTheme = { colors: { brand: "#0000ff" } };

    mockUseDataAppBundle.mockReturnValue({
      failed: false,
      data: {
        component: () => <div>Orders app</div>,
        providerProps: { theme: appTheme },
      },
    });

    render(<DataAppEmbed />);

    expect(await screen.findByText("Orders app")).toBeInTheDocument();

    await waitFor(() =>
      expect(mockComponentProvider.mock.lastCall?.[0]).toMatchObject({
        authConfig: {
          isGuest: false,
          metabaseInstanceUrl: window.location.origin,
        },
        theme: appTheme,
      }),
    );

    expect(mockUseDataAppBundle).toHaveBeenCalledWith("sales", {
      embedded: true,
    });
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
    expect(mockUseDataAppBundle).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:5000",
    "http://[::1]:4000",
  ])(
    "passes API-key authentication for the actual loopback origin %s",
    (parentOrigin) => {
      setupSettings(
        { apiKey: "development-key", _isLocalhost: false },
        parentOrigin,
      );
      render(<DataAppEmbed />);

      expect(mockComponentProvider.mock.lastCall?.[0]).toMatchObject({
        authConfig: {
          metabaseInstanceUrl: window.location.origin,
          apiKey: "development-key",
        },
        isLocalHost: true,
      });
      expect(mockUseDataAppBundle).toHaveBeenCalledWith("sales", {
        embedded: true,
      });
    },
  );

  it.each(["https://host.example.com", "null", null])(
    "rejects API keys from %s even when settings claim localhost",
    (parentOrigin) => {
      setupSettings(
        {
          apiKey: "development-key",
          _isLocalhost: true,
          _embedReferrer: "http://localhost:3000",
        },
        parentOrigin,
      );
      render(<DataAppEmbed />);

      expect(
        screen.getByText("Using an API key in production is not allowed."),
      ).toBeInTheDocument();
      expect(mockComponentProvider).not.toHaveBeenCalled();
      expect(mockUseDataAppBundle).not.toHaveBeenCalled();
    },
  );

  it("allows local API-key development without the embedding license", () => {
    jest.spyOn(PLUGIN_EMBEDDING_IFRAME_SDK, "isEnabled").mockReturnValue(false);
    setupSettings({ apiKey: "development-key" }, "http://localhost:3000");
    render(<DataAppEmbed />);

    expect(mockComponentProvider).toHaveBeenCalled();
    expect(mockUseDataAppBundle).toHaveBeenCalledWith("sales", {
      embedded: true,
    });
  });

  it("waits for settings to arrive before starting auth", () => {
    mockUseSdkIframeEmbedEventBus.mockReturnValue({
      embedSettings: null,
      sendMessage: jest.fn(),
      parentOrigin: null,
    });

    render(<DataAppEmbed />);

    expect(mockComponentProvider).not.toHaveBeenCalled();
    expect(mockUseDataAppBundle).not.toHaveBeenCalled();
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

      expect(mockComponentProvider).not.toHaveBeenCalled();
      expect(mockUseDataAppBundle).not.toHaveBeenCalled();
    },
  );

  it("requires the embedding license before starting auth", () => {
    jest.spyOn(PLUGIN_EMBEDDING_IFRAME_SDK, "isEnabled").mockReturnValue(false);

    render(<DataAppEmbed />);

    expect(
      screen.getByText("A valid license is required for embedding."),
    ).toBeInTheDocument();

    expect(mockComponentProvider).not.toHaveBeenCalled();
    expect(mockUseDataAppBundle).not.toHaveBeenCalled();
  });

  it("shows auth failures without loading the app", () => {
    mockUseSdkSelector.mockReturnValue({
      status: "error",
      error: { message: "SSO failed" },
    });

    render(<DataAppEmbed />);
    expect(screen.getByText("SSO failed")).toBeInTheDocument();
    expect(mockUseDataAppBundle).not.toHaveBeenCalled();
  });

  it("shows data app bundle errors inside the iframe", () => {
    mockUseDataAppBundle.mockReturnValue({
      data: null,
      failed: true,
      error: "Access denied",
    });

    render(<DataAppEmbed />);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
});
