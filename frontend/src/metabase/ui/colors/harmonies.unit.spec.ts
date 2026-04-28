import Color from "color";

import { DEFAULT_HARMONY_COLORS, suggestHarmonyColors } from "./harmonies";

const BRAND = "#509ee3";

describe("suggestHarmonyColors", () => {
  describe("low-saturation fallback", () => {
    it.each([
      ["pure grey", "#808080"],
      ["off-white", "#eeeeee"],
      ["near-black", "#222222"],
    ])("returns the default palette for %s", (_label, color) => {
      expect(suggestHarmonyColors(color, "octagonal")).toEqual(
        DEFAULT_HARMONY_COLORS,
      );
      expect(suggestHarmonyColors(color, "square")).toEqual(
        DEFAULT_HARMONY_COLORS,
      );
    });
  });

  describe("octagonal", () => {
    const result = suggestHarmonyColors(BRAND, "octagonal");

    it("returns 8 chart colors", () => {
      expect(result.charts).toHaveLength(8);
    });

    it("places chart colors at 45° increments starting from the brand hue", () => {
      const brandHue = Color(BRAND).hue();
      result.charts.forEach((chart, i) => {
        const expectedHue = (brandHue + i * 45 + 360) % 360;
        const actualHue = Color(chart).hue();
        // Allow rounding tolerance from hex round-trip.
        expect(Math.abs(actualHue - expectedHue)).toBeLessThan(1);
      });
    });

    it("preserves brand saturation and lightness across chart colors", () => {
      const brand = Color(BRAND);
      result.charts.forEach((chart) => {
        const c = Color(chart);
        expect(Math.abs(c.saturationl() - brand.saturationl())).toBeLessThan(1);
        expect(Math.abs(c.lightness() - brand.lightness())).toBeLessThan(1);
      });
    });

    it("derives filter at brand+90° and summarize at brand-90°", () => {
      const brandHue = Color(BRAND).hue();
      expect(
        Math.abs(Color(result.filter).hue() - ((brandHue + 90) % 360)),
      ).toBeLessThan(1);
      expect(
        Math.abs(Color(result.summarize).hue() - ((brandHue + 270) % 360)),
      ).toBeLessThan(1);
    });

    it("anchors positive and negative to fixed hues", () => {
      expect(Color(result.positive).hue()).toBeCloseTo(130, 0);
      expect(Color(result.negative).hue() % 360).toBeCloseTo(0, 0);
    });
  });

  describe("square", () => {
    const result = suggestHarmonyColors(BRAND, "square");

    it("returns 8 chart colors", () => {
      expect(result.charts).toHaveLength(8);
    });

    it("uses 4 base hues at 90° increments, each paired with a lighter variant", () => {
      const brandHue = Color(BRAND).hue();
      const baseChartIndices = [0, 2, 4, 6];
      baseChartIndices.forEach((idx, hueIdx) => {
        const expectedHue = (brandHue + hueIdx * 90 + 360) % 360;
        expect(
          Math.abs(Color(result.charts[idx]).hue() - expectedHue),
        ).toBeLessThan(1);
      });
    });

    it("each lighter variant is lighter than its paired base", () => {
      [0, 2, 4, 6].forEach((idx) => {
        const base = Color(result.charts[idx]);
        const lighter = Color(result.charts[idx + 1]);
        expect(lighter.lightness()).toBeGreaterThan(base.lightness());
      });
    });
  });

  it("is deterministic for the same input", () => {
    expect(suggestHarmonyColors(BRAND, "octagonal")).toEqual(
      suggestHarmonyColors(BRAND, "octagonal"),
    );
    expect(suggestHarmonyColors(BRAND, "square")).toEqual(
      suggestHarmonyColors(BRAND, "square"),
    );
  });
});
