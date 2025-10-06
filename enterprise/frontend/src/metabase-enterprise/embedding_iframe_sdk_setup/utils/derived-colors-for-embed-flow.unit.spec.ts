import type { MetabaseTheme } from "embedding-sdk-bundle/types/ui";

import { getDerivedDefaultColorsForEmbedFlow } from "./derived-colors-for-embed-flow";

describe("getDerivedDefaultColorsForEmbedFlow", () => {
  it("derives colors for light theme", () => {
    const theme: MetabaseTheme = {
      colors: {
        background: "#ffffff",
        "text-primary": "#333333",
        brand: "#509ee3",
        border: "#d9d9d9",
      },
    };

    const { colors } = getDerivedDefaultColorsForEmbedFlow(theme);

    expect(colors?.background).toBe("#ffffff");
    expect(colors?.["text-primary"]).toBe("#333333");
    expect(colors?.["background-hover"]).toBe("rgb(252, 252, 252)");
    expect(colors?.["background-disabled"]).toBe("rgb(247, 247, 247)");
    expect(colors?.["text-secondary"]).toBe("rgb(66, 66, 66)");
    expect(colors?.["text-tertiary"]).toBe("rgb(82, 82, 82)");
  });

  it("derives colors for dark theme", () => {
    const theme: MetabaseTheme = {
      colors: {
        background: "#1a1a1a",
        "text-primary": "#ffffff",
        brand: "#509ee3",
      },
    };

    const { colors } = getDerivedDefaultColorsForEmbedFlow(theme);

    expect(colors?.background).toBe("#1a1a1a");
    expect(colors?.["text-primary"]).toBe("#ffffff");
    expect(colors?.["background-hover"]).toBe("rgb(39, 39, 39)");
    expect(colors?.["background-disabled"]).toBe("rgb(31, 31, 31)");
    expect(colors?.["text-secondary"]).toBe("rgb(179, 179, 179)");
    expect(colors?.["text-tertiary"]).toBe("rgb(102, 102, 102)");
  });

  it("uses the default text-primary color if only background is defined", () => {
    const theme: MetabaseTheme = {
      colors: {
        background: "#1a1a1a",
      },
    };

    const { colors } = getDerivedDefaultColorsForEmbedFlow(theme);
    expect(colors?.["text-primary"]).toBe("#4C5773");
  });

  it("should not override existing colors", () => {
    const theme: MetabaseTheme = {
      colors: {
        background: "#ffffff",
        "text-primary": "#333333",
        "background-hover": "#existing-color",
      },
    };

    const { colors } = getDerivedDefaultColorsForEmbedFlow(theme);

    expect(colors?.background).toBe("#ffffff");
    expect(colors?.["text-primary"]).toBe("#333333");
    expect(colors?.["background-hover"]).toBe("#existing-color");
  });

  it("derives color from white-labeled colors", () => {
    const theme: MetabaseTheme = {};

    const appColors = {
      "bg-white": "#2d3030",
      "text-dark": "#eee",
    };

    const { colors } = getDerivedDefaultColorsForEmbedFlow(theme, appColors);

    expect(colors?.["background-hover"]).toBe("rgb(68, 72, 72)");
  });

  it("derives default colors for empty themes", () => {
    const { colors } = getDerivedDefaultColorsForEmbedFlow({});

    expect(colors).toBeDefined();
    expect(colors?.["background-hover"]).toBeDefined();
    expect(colors?.["text-secondary"]).toBeDefined();
  });
});
