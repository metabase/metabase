import {
  getEmbeddingColorPalette,
  setGlobalEmbeddingColors,
} from "metabase/embedding-sdk/theme/embedding-color-palette";
import { colors } from "metabase/ui/colors";
import { getSeriesColors } from "metabase/viz-core";
import type { SeriesSettings } from "metabase-types/api";

describe("Embedding Color Palette", () => {
  it("transforms chart color overrides into accent colors", () => {
    const expected: Record<string, string> = {
      accent0: "#111",
      accent1: "#222",
      accent2: "#333",
      "accent2-light": "#444",
      accent3: "#555",
      "accent3-dark": "#666",
    };

    // Unjustified type cast. FIXME
    const palette = getEmbeddingColorPalette({
      charts: [
        expected.accent0,
        { base: expected.accent1 },
        { base: expected.accent2, tint: expected["accent2-light"] },
        { base: expected.accent3, shade: expected["accent3-dark"] },
      ],
    }) as Record<string, string>;

    for (const key in expected) {
      expect(palette[key]).toBe(expected[key]);
    }
  });

  describe("chart series colors", () => {
    const THEME_CHARTS = ["#111111", "#222222", "#333333"];

    const getCountSeriesColor = (series: SeriesSettings) =>
      getSeriesColors(["count"], { series_settings: { count: series } }, [
        undefined,
      ]).count;

    afterEach(() => {
      setGlobalEmbeddingColors();
    });

    it("follows the theme when the series records a palette color", () => {
      setGlobalEmbeddingColors({ charts: THEME_CHARTS });

      expect(
        getCountSeriesColor({ color: "#123456", color_name: "accent2" }),
      ).toBe(THEME_CHARTS[2]);
    });

    it("leaves a series that only has a stored color untouched", () => {
      const pickedColor = colors.accent2;

      setGlobalEmbeddingColors({ charts: THEME_CHARTS });

      expect(getCountSeriesColor({ color: pickedColor })).toBe(pickedColor);
    });

    it("leaves a series alone when the theme sets no chart colors", () => {
      setGlobalEmbeddingColors({ brand: "#123456" });

      expect(
        getCountSeriesColor({ color: "#123456", color_name: "accent2" }),
      ).toBe(colors.accent2);
    });
  });
});
