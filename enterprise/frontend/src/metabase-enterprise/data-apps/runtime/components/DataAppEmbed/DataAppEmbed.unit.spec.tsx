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

  // TODO(DAT-18): add api key support for local development
  it.each([true, false])("rejects API keys on localhost: %s", (isLocalhost) => {
    setupSettings({ apiKey: "development-key", _isLocalhost: isLocalhost });
    render(<DataAppEmbed />);

    expect(
      screen.getByText("Embedded data apps require SSO authentication."),
    ).toBeInTheDocument();

    expect(mockComponentProvider).not.toHaveBeenCalled();
    expect(mockUseDataAppBundle).not.toHaveBeenCalled();
  });

  it("waits for settings to arrive before starting auth", () => {
    mockUseSdkIframeEmbedEventBus.mockReturnValue({
      embedSettings: null,
      sendMessage: jest.fn(),
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
