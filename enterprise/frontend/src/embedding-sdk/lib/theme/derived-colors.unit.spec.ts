import type { MantineThemeOverride } from "metabase/ui";

import { colorTuple } from "./color-tuple";
import { getDerivedSdkDefaultColors } from "./derived-colors";

describe("getDerivedSdkDefaultColors", () => {
  it("derives colors for light theme", () => {
    const override: MantineThemeOverride = {
      colors: {
        "bg-white": colorTuple("#ffffff"),
        "text-dark": colorTuple("#333333"),
        brand: colorTuple("#509ee3"),
        border: colorTuple("#d9d9d9"),
      },
    };

    const result = getDerivedSdkDefaultColors({ override });

    // Includes the provided colors
    expect(result.colors?.["bg-white"]).toEqual(colorTuple("#ffffff"));
    expect(result.colors?.["text-dark"]).toEqual(colorTuple("#333333"));

    // Derive colors from the background color
    expect(result.colors?.["background-hover"]).toEqual(
      colorTuple("hsl(0, 0%, 99%)"),
    );
    expect(result.colors?.["background-disabled"]).toEqual(
      colorTuple("hsl(0, 0%, 97%)"),
    );
    expect(result.colors?.["text-secondary"]).toEqual(
      colorTuple("rgba(51, 51, 51, 0.7)"),
    );
    expect(result.colors?.["text-tertiary"]).toEqual(
      colorTuple("rgba(51, 51, 51, 0.5)"),
    );
  });

  it("derives colors for dark theme", () => {
    const override: MantineThemeOverride = {
      colors: {
        "bg-white": colorTuple("#1a1a1a"), // Dark background
        "text-dark": colorTuple("#ffffff"), // Light text for dark theme
        "text-white": colorTuple("#ffffff"), // White text
        brand: colorTuple("#509ee3"),
      },
    };

    const result = getDerivedSdkDefaultColors({ override });

    // Includes the provided colors
    expect(result.colors?.["bg-white"]).toEqual(colorTuple("#1a1a1a"));
    expect(result.colors?.["text-dark"]).toEqual(colorTuple("#ffffff"));

    // Dark theme derivations use different operations
    // background-hover uses lighten: 0.5 from bg-white in dark theme
    expect(result.colors?.["bg-light"]).toEqual(
      colorTuple("hsl(0, 0%, 15.3%)"),
    );

    // background-disabled uses lighten: 0.2 from bg-white in dark theme
    expect(result.colors?.["background-disabled"]).toEqual(
      colorTuple("hsl(0, 0%, 12.2%)"),
    );

    // Text colors use text-white as source with alpha in dark theme
    expect(result.colors?.["text-medium"]).toEqual(
      colorTuple("rgba(255, 255, 255, 0.7)"),
    );
    expect(result.colors?.["text-light"]).toEqual(
      colorTuple("rgba(255, 255, 255, 0.5)"),
    );

    // Brand colors use alpha operations in dark theme
    expect(result.colors?.["brand-light"]).toEqual(
      colorTuple("rgba(80, 158, 227, 0.5)"),
    );
    expect(result.colors?.["brand-lighter"]).toEqual(
      colorTuple("rgba(80, 158, 227, 0.3)"),
    );
  });

  it("should not override existing colors", () => {
    const override: MantineThemeOverride = {
      colors: {
        "bg-white": colorTuple("#ffffff"),
        "text-dark": colorTuple("#333333"),
        "custom-color": colorTuple("#existing-color"), // Already defined
      },
    };

    const result = getDerivedSdkDefaultColors({ override });

    expect(result.colors?.["bg-white"]).toEqual(colorTuple("#ffffff"));
    expect(result.colors?.["text-dark"]).toEqual(colorTuple("#333333"));
    expect(result.colors?.["custom-color"]).toEqual(
      colorTuple("#existing-color"),
    );
  });

  it("should derive color from whitelabeled colors", () => {
    const override: MantineThemeOverride = {};

    const appColors = {
      "bg-white": "#2d3030",
      "text-dark": "#eee",
    };

    const result = getDerivedSdkDefaultColors({ override, appColors });

    expect(result.colors?.["bg-light"]).toEqual(
      colorTuple("hsl(180, 3.2%, 27.4%)"),
    );
  });
});
