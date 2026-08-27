import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

jest.mock("metabase/css/core/index.css", () => ({
  textCentered: "textCentered",
  textBrand: "textBrand",
  textMetabaseBrand: "textMetabaseBrand",
  textWhite: "textWhite",
}));

import { LogoIcon } from "./LogoIcon";

const NOOP_SVG_DATA_URI =
  'data:image/svg+xml,<svg data-testid="noop-svg"><circle r="1"/></svg>';

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

  it("should fall back to img element for non-SVG data URIs", async () => {
    const pngDataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    setup({}, { "application-logo-url": pngDataUri });

    await waitFor(() => {
      const container = screen.getByTestId("main-logo");
      expect(container.querySelector("img")).toBeInTheDocument();
    });

    const img = screen.getByTestId("main-logo").querySelector("img");
    expect(img).toHaveAttribute("src", pngDataUri);
  });

  it("should fall back to img when data URI declares SVG but contains no svg tag", async () => {
    const badSvgDataUri = "data:image/svg+xml,<div>not-svg</div>";

    setup({}, { "application-logo-url": badSvgDataUri });

    await waitFor(() => {
      const container = screen.getByTestId("main-logo");
      expect(container.querySelector("img")).toBeInTheDocument();
    });
  });

  it("should apply width and height props to the rendered SVG", async () => {
    const svgData = '<svg data-testid="sized-svg"><circle r="10"/></svg>';
    const dataUri = `data:image/svg+xml,${svgData}`;

    setup({ width: 64, height: 48 }, { "application-logo-url": dataUri });

    await waitFor(() => {
      expect(screen.getByTestId("sized-svg")).toBeInTheDocument();
    });

    const svg = screen.getByTestId("sized-svg");
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "48");
  });

  it("should apply textMetabaseBrand when not dark and the logo is the default", () => {
    fetchMock.get("http://localhost//app/assets/img/logo.svg", 404);
    setup({}, { "application-logo-url": "app/assets/img/logo.svg" });

    const container = screen.getByTestId("main-logo");
    expect(container).toHaveClass("textMetabaseBrand");
    expect(container).not.toHaveClass("textBrand");
    expect(container).not.toHaveClass("textWhite");
  });

  it("should apply textBrand when not dark and the logo is whitelabeled", () => {
    setup({}, { "application-logo-url": NOOP_SVG_DATA_URI });

    const container = screen.getByTestId("main-logo");
    expect(container).toHaveClass("textBrand");
    expect(container).not.toHaveClass("textMetabaseBrand");
    expect(container).not.toHaveClass("textWhite");
  });

  it("should apply textWhite when dark is true", () => {
    setup({ dark: true }, { "application-logo-url": NOOP_SVG_DATA_URI });

    const container = screen.getByTestId("main-logo");
    expect(container).toHaveClass("textWhite");
    expect(container).not.toHaveClass("textMetabaseBrand");
    expect(container).not.toHaveClass("textBrand");
  });

  it("should merge a custom className", () => {
    setup(
      { className: "my-custom-class" },
      { "application-logo-url": NOOP_SVG_DATA_URI },
    );

    const container = screen.getByTestId("main-logo");
    expect(container).toHaveClass("my-custom-class");
  });

  it("should apply custom style and the height prop", () => {
    setup(
      { height: 48, style: { color: "rgb(1, 2, 3)" } },
      { "application-logo-url": NOOP_SVG_DATA_URI },
    );

    const container = screen.getByTestId("main-logo");
    expect(container).toHaveStyle({ color: "rgb(1, 2, 3)", height: "48px" });
  });

  it("should let style.height override the height prop", () => {
    setup(
      { height: 48, style: { height: "16px" } },
      { "application-logo-url": NOOP_SVG_DATA_URI },
    );

    const container = screen.getByTestId("main-logo");
    expect(container).toHaveStyle({ height: "16px" });
  });
});
