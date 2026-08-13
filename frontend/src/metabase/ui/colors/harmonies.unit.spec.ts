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
      expect(suggestHarmonyColors(color)).toEqual(DEFAULT_HARMONY_COLORS);
    });
  });

  describe("chart colors (octagonal harmony)", () => {
    const result = suggestHarmonyColors(BRAND);

    it("returns 8 chart colors", () => {
      expect(result.charts).toHaveLength(8);
    });

    it("uses the brand color verbatim for chart[0]", () => {
      expect(result.charts[0]).toBe(BRAND.toLowerCase());
    });

    it("places chart[1..7] at 45° increments from the brand hue", () => {
      const brandHue = Color(BRAND).hue();
      result.charts.slice(1).forEach((chart, i) => {
        const expectedHue = (brandHue + (i + 1) * 45) % 360;
        const actualHue = Color(chart).hue();
        expect(Math.abs(actualHue - expectedHue)).toBeLessThan(1);
      });
    });

    it("preserves brand saturation and lightness across chart[1..7]", () => {
      const brand = Color(BRAND);
      result.charts.slice(1).forEach((chart) => {
        const c = Color(chart);
        expect(Math.abs(c.saturationl() - brand.saturationl())).toBeLessThan(1);
        expect(Math.abs(c.lightness() - brand.lightness())).toBeLessThan(1);
      });
    });
  });

  describe("filter and summarize (square harmony)", () => {
    const result = suggestHarmonyColors(BRAND);

    it("derives filter at brand+90° and summarize at brand-90°", () => {
      const brandHue = Color(BRAND).hue();
      expect(
        Math.abs(Color(result.filter).hue() - ((brandHue + 90) % 360)),
      ).toBeLessThan(1);
      expect(
        Math.abs(Color(result.summarize).hue() - ((brandHue + 270) % 360)),
      ).toBeLessThan(1);
    });

    it("preserves brand lightness for filter and summarize", () => {
      const brand = Color(BRAND);
      expect(
        Math.abs(Color(result.filter).lightness() - brand.lightness()),
      ).toBeLessThan(1);
      expect(
        Math.abs(Color(result.summarize).lightness() - brand.lightness()),
      ).toBeLessThan(1);
    });
  });

  describe("positive and negative", () => {
    const result = suggestHarmonyColors(BRAND);

    it("anchors positive at hue 89°", () => {
      expect(Color(result.positive).hue()).toBeCloseTo(89, 0);
    });

    it("anchors negative at hue 359°", () => {
      const hue = Color(result.negative).hue();
      // 359 may round to 359 or wrap close to 0 depending on hex precision.
      expect(Math.min(Math.abs(hue - 359), Math.abs(hue + 1))).toBeLessThan(1);
    });

    it("places positive and negative at lightness 50", () => {
      expect(Color(result.positive).lightness()).toBeCloseTo(50, 0);
      expect(Color(result.negative).lightness()).toBeCloseTo(50, 0);
    });

    it("preserves brand saturation for positive and negative", () => {
      const brand = Color(BRAND);
      expect(
        Math.abs(Color(result.positive).saturationl() - brand.saturationl()),
      ).toBeLessThan(1);
      expect(
        Math.abs(Color(result.negative).saturationl() - brand.saturationl()),
      ).toBeLessThan(1);
    });
  });

  it("is deterministic for the same input", () => {
    expect(suggestHarmonyColors(BRAND)).toEqual(suggestHarmonyColors(BRAND));
  });
});
