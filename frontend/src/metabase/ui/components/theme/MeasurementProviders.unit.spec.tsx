import { render, screen } from "@testing-library/react";

import { MeasurementProviders } from "./MeasurementProviders";

const SCHEME_ATTR = "data-mantine-color-scheme";

describe("MeasurementProviders", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(SCHEME_ATTR);
  });

  it("does not flip `data-mantine-color-scheme` on <html> when rendered in dark mode (UXW-3733)", () => {
    // Simulate the state set by the main app's MantineProvider.
    document.documentElement.setAttribute(SCHEME_ATTR, "dark");

    const { unmount } = render(
      <MeasurementProviders>
        <div>measurement</div>
      </MeasurementProviders>,
    );

    // The nested MantineProvider would previously default to `forceColorScheme="light"`
    // (detached root → useColorScheme() returns the context default "light"), flipping
    // the html attribute. The fix reads the current scheme off <html> and passes it
    // through so the attribute value never changes.
    expect(document.documentElement).toHaveAttribute(SCHEME_ATTR, "dark");

    unmount();

    expect(document.documentElement).toHaveAttribute(SCHEME_ATTR, "dark");
  });

  it("does not flip `data-mantine-color-scheme` on <html> when rendered in light mode", () => {
    document.documentElement.setAttribute(SCHEME_ATTR, "light");

    const { unmount } = render(
      <MeasurementProviders>
        <div>measurement</div>
      </MeasurementProviders>,
    );

    expect(document.documentElement).toHaveAttribute(SCHEME_ATTR, "light");

    unmount();

    expect(document.documentElement).toHaveAttribute(SCHEME_ATTR, "light");
  });

  it("renders its children", () => {
    render(
      <MeasurementProviders>
        <div>measurement content</div>
      </MeasurementProviders>,
    );

    expect(screen.getByText("measurement content")).toBeInTheDocument();
  });
});
