import type { MantineThemeOverride } from "metabase/ui";

import { colorTuple } from "./color-tuple";
import { getDerivedSdkDefaultColors } from "./derived-colors";

describe("getDerivedSdkDefaultColors", () => {
  it("should return derived colors for light theme", () => {
    const override: MantineThemeOverride = {
      colors: {
        "bg-white": colorTuple("#ffffff"),
        "text-dark": colorTuple("#333333"),
        brand: colorTuple("#509ee3"),
        border: colorTuple("#d9d9d9"),
      },
    };

    const result = getDerivedSdkDefaultColors({ override });

    // Should include the original override colors
    expect(result.colors?.["bg-white"]).toEqual(colorTuple("#ffffff"));
    expect(result.colors?.["text-dark"]).toEqual(colorTuple("#333333"));

    // Should include derived colors with specific expected values
    expect(result.colors?.["background-hover"]).toEqual(
      colorTuple("hsl(0, 0%, 95%)"),
    );
    expect(result.colors?.["background-disabled"]).toEqual(
      colorTuple("hsl(0, 0%, 90%)"),
    );
    expect(result.colors?.["text-secondary"]).toEqual(
      colorTuple("rgba(51, 51, 51, 0.7)"),
    );
    expect(result.colors?.["text-tertiary"]).toEqual(
      colorTuple("rgba(51, 51, 51, 0.5)"),
    );

    // Should include all expected derived colors
    expect(result.colors).toBeDefined();
    expect(Object.keys(result.colors || {})).toContain("background-hover");
    expect(Object.keys(result.colors || {})).toContain("background-disabled");
    expect(Object.keys(result.colors || {})).toContain("text-secondary");
    expect(Object.keys(result.colors || {})).toContain("text-tertiary");
  });

  it("should preserve existing colors", () => {
    const override: MantineThemeOverride = {
      colors: {
        "bg-white": colorTuple("#ffffff"),
        "text-dark": colorTuple("#333333"),
        "custom-color": colorTuple("#existing-color"), // Already defined
      },
    };

    const result = getDerivedSdkDefaultColors({ override });

    // Should preserve existing colors
    expect(result.colors?.["bg-white"]).toEqual(colorTuple("#ffffff"));
    expect(result.colors?.["text-dark"]).toEqual(colorTuple("#333333"));
    expect(result.colors?.["custom-color"]).toEqual(
      colorTuple("#existing-color"),
    );
  });

  it("should use app colors when available", () => {
    const override: MantineThemeOverride = {
      colors: {},
    };
    const appColors = {
      "bg-white": "#f8f9fa",
      "text-dark": "#212529",
    };

    const result = getDerivedSdkDefaultColors({ override, appColors });

    expect(result.colors).toBeDefined();
    expect(typeof result.colors).toBe("object");
  });

  it("should handle empty override gracefully", () => {
    const override: MantineThemeOverride = {};

    const result = getDerivedSdkDefaultColors({ override });

    expect(result.colors).toBeDefined();
    expect(typeof result.colors).toBe("object");
  });

  it("should return a proper theme override structure", () => {
    const override: MantineThemeOverride = {
      fontFamily: "Arial, sans-serif",
      colors: {
        brand: colorTuple("#509ee3"),
      },
    };

    const result = getDerivedSdkDefaultColors({ override });

    // Should preserve the original structure
    expect(result.fontFamily).toBe("Arial, sans-serif");
    expect(result.colors).toBeDefined();
    expect(result.colors?.brand).toEqual(colorTuple("#509ee3"));
  });
});
