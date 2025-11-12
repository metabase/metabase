import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import LogoIcon from "./LogoIcon";

const setup = (props = {}, settingsOverrides = {}) => {
  const storeInitialState = createMockState({
    settings: mockSettings(createMockSettings(settingsOverrides)),
  });

  return renderWithProviders(<LogoIcon {...props} />, { storeInitialState });
};

describe("LogoIcon", () => {
  it("should render a data URI SVG inline", async () => {
    const svgData = '<svg data-testid="my-svg"><circle r="10"/></svg>';
    const dataUri = `data:image/svg+xml,${svgData}`;

    setup({}, { "application-logo-url": dataUri });

    // Wait for the component to process the data URI
    await waitFor(() => {
      expect(screen.getByTestId("my-svg")).toBeInTheDocument();
    });

    const svg = screen.getByTestId("my-svg");
    expect(svg).toHaveAttribute("fill", "currentcolor");
  });

  it("should make fetch request and handle unmount correctly (metabase#65543)", async () => {
    const svgContent = '<svg data-testid="fetch-svg"><circle r="5"/></svg>';
    fetchMock.get("https://example.com/logo.svg", svgContent);

    const { unmount } = setup(
      {},
      { "application-logo-url": "https://example.com/logo.svg" },
    );

    // Wait for fetch to be called
    await waitFor(() => {
      expect(fetchMock.callHistory.calls().length).toBeGreaterThan(0);
    });

    // Verify content is rendered (img fallback is acceptable in test env)
    await waitFor(() => {
      const container = screen.getByTestId("main-logo");
      expect(container.children.length).toBeGreaterThan(0);
    });

    unmount();

    // Verify fetch was called with correct URL
    const calls = fetchMock.callHistory.calls();
    expect(calls[0].url).toBe("https://example.com/logo.svg");
  });

  it("should use default logo URL when no setting is provided", async () => {
    const svgContent = '<svg data-testid="default-svg"><circle r="5"/></svg>';
    fetchMock.get("http://localhost//app/assets/img/logo.svg", svgContent);

    setup();

    // Wait for fetch to be called
    await waitFor(() => {
      expect(fetchMock.callHistory.calls().length).toBeGreaterThan(0);
    });

    // Verify content is rendered
    await waitFor(() => {
      const container = screen.getByTestId("main-logo");
      expect(container.children.length).toBeGreaterThan(0);
    });

    // Verify fetch was called with default URL (may be absolute in test env)
    const calls = fetchMock.callHistory.calls();
    expect(calls[0].url).toContain("app/assets/img/logo.svg");
  });

  it("should make fetch request for external SVG", async () => {
    const svgContent = '<svg data-testid="fetch-svg"><circle r="5"/></svg>';
    fetchMock.get("https://example.com/logo.svg", svgContent);

    setup({}, { "application-logo-url": "https://example.com/logo.svg" });

    // Wait for fetch to be called
    await waitFor(() => {
      expect(fetchMock.callHistory.calls().length).toBeGreaterThan(0);
    });

    // Verify content is rendered
    await waitFor(() => {
      const container = screen.getByTestId("main-logo");
      expect(container.children.length).toBeGreaterThan(0);
    });

    // Verify fetch was called with correct URL
    const calls = fetchMock.callHistory.calls();
    expect(calls[0].url).toBe("https://example.com/logo.svg");
  });

  it("should fall back to img element on fetch error", async () => {
    fetchMock.get("https://example.com/logo.svg", 404);

    setup({}, { "application-logo-url": "https://example.com/logo.svg" });

    await waitFor(() => {
      const container = screen.getByTestId("main-logo");
      expect(container.querySelector("img")).toBeInTheDocument();
    });
  });
});
