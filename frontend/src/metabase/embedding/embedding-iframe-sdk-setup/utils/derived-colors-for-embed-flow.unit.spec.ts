import type { MetabaseTheme } from "embedding-sdk-bundle/types/ui";

import { getDerivedDefaultColorsForEmbedFlow } from "./derived-colors-for-embed-flow";

describe("getDerivedDefaultColorsForEmbedFlow", () => {
  describe('when "Simple Embed" feature is available', () => {
    const isSimpleEmbedFeatureAvailable = true;

    it("derives colors for light theme", () => {
      const theme: MetabaseTheme = {
        colors: {
          background: "#ffffff",
          "text-primary": "#333333",
          brand: "#509ee3",
          border: "#d9d9d9",
        },
      };

      const { colors } = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme,
      });

      expect(colors?.background).toBe("#ffffff");
      expect(colors?.["text-primary"]).toBe("#333333");
      expect(colors?.["background-secondary"]).toBe("rgb(250, 250, 250)");
      expect(colors?.["background-disabled"]).toBe("rgb(247, 247, 247)");
      expect(colors?.["text-secondary"]).toBe("rgb(66, 66, 66)");
      expect(colors?.["text-tertiary"]).toBe("rgb(82, 82, 82)");

      // Should no longer derive background-hover as it is color-mix'd
      // in the colors configuration
      expect(colors?.["background-hover"]).toBeUndefined();
    });

    it("derives colors for dark theme", () => {
      const theme: MetabaseTheme = {
        colors: {
          background: "#1a1a1a",
          "text-primary": "#ffffff",
          brand: "#509ee3",
        },
      };

      const { colors } = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme,
      });

      expect(colors?.background).toBe("#1a1a1a");
      expect(colors?.["text-primary"]).toBe("#ffffff");
      expect(colors?.["background-secondary"]).toBe("rgb(21, 21, 21)");
      expect(colors?.["background-disabled"]).toBe("rgb(31, 31, 31)");
      expect(colors?.["text-secondary"]).toBe("rgb(179, 179, 179)");
      expect(colors?.["text-tertiary"]).toBe("rgb(102, 102, 102)");

      // Should no longer derive background-hover as it is color-mix'd
      // in the colors configuration
      expect(colors?.["background-hover"]).toBeUndefined();
    });

    it("uses the default text-primary color if only background is defined", () => {
      const theme: MetabaseTheme = {
        colors: {
          background: "#1a1a1a",
        },
      };

      const { colors } = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme,
      });
      expect(colors?.["text-primary"]).toBe("hsla(204, 66%, 8%, 0.84)");
    });

    it("should not override existing colors", () => {
      const theme: MetabaseTheme = {
        colors: {
          background: "#ffffff",
          "text-primary": "#333333",
          "background-secondary": "#existing-color",
        },
      };

      const { colors } = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme,
      });

      expect(colors?.background).toBe("#ffffff");
      expect(colors?.["text-primary"]).toBe("#333333");
      expect(colors?.["background-secondary"]).toBe("#existing-color");
    });

    it("derives color from white-labeled colors", () => {
      const theme: MetabaseTheme = {};

      const applicationColors = {
        "background-primary": "#2d3030",
        "text-primary": "#eee",
      };

      const { colors } = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme,
        applicationColors,
      });

      expect(colors?.["background-secondary"]).toBe("rgb(36, 38, 38)");
    });

    it("derives default colors for empty themes", () => {
      const { colors } = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme: {},
      });

      expect(colors).toBeDefined();
      expect(colors?.["background-secondary"]).toBeDefined();
      expect(colors?.["text-secondary"]).toBeDefined();
    });
  });

  describe('when "Simple Embed" feature is not available', () => {
    const isSimpleEmbedFeatureAvailable = false;

    it("returns only the preset from the theme", () => {
      const theme: MetabaseTheme = {
        preset: "dark",
        colors: {
          background: "#1a1a1a",
          "text-primary": "#ffffff",
          brand: "#509ee3",
        },
      };

      const result = getDerivedDefaultColorsForEmbedFlow({
        isSimpleEmbedFeatureAvailable,
        theme,
      });

      expect(result).toEqual({ preset: "dark" });
    });
  });
});
