import Color from "color";

import { color } from "./palette";
import { getColorScale, getSafeColor } from "./scales";

describe("scales", () => {
  const colors = [
    Color(color("background-primary")).hex(),
    Color(color("background-primary-inverse")).hex(),
  ];

  it("should interpolate colors by default", () => {
    const scale = getColorScale([0, 1], colors);

    expect(scale(0.2).toUpperCase()).not.toEqual(colors[0]);
    expect(scale(0.8).toUpperCase()).not.toEqual(colors[1]);
  });

  it("should not interpolate colors when specified", () => {
    const scale = getColorScale([0, 1], colors, true);

    expect(scale(0.2).toUpperCase()).toEqual(colors[0]);
    expect(scale(0.8).toUpperCase()).toEqual(colors[1]);
  });
});

describe("getSafeColor", () => {
  describe("decimal RGB values", () => {
    it("should round RGB components to integers while preserving alpha", () => {
      expect(getSafeColor("rgba(123.456, 78.9, 255.1, 0.5)")).toBe(
        "rgba(123, 79, 255, 0.5)",
      );
    });

    it("should round values correctly (rounding up)", () => {
      expect(getSafeColor("rgba(100.7, 200.3, 50.9, 0.75)")).toBe(
        "rgba(101, 200, 51, 0.75)",
      );
    });

    it("should round values correctly (rounding down)", () => {
      expect(getSafeColor("rgba(100.2, 200.1, 50.3, 0.25)")).toBe(
        "rgba(100, 200, 50, 0.25)",
      );
    });

    it("should handle edge cases with values near 0", () => {
      expect(getSafeColor("rgba(0.4, 0.6, 0.9, 0.1)")).toBe(
        "rgba(0, 1, 1, 0.1)",
      );
    });

    it("should handle edge cases with values near 255", () => {
      expect(getSafeColor("rgba(254.5, 254.9, 255.0, 1.0)")).toBe(
        "rgba(255, 255, 255, 1)",
      );
    });

    it("should preserve alpha channel exactly as provided", () => {
      expect(getSafeColor("rgba(100.5, 200.5, 50.5, 0.123456)")).toBe(
        "rgba(101, 201, 51, 0.123456)",
      );
    });
  });

  describe("integer RGB values", () => {
    it("should handle integer RGB values (most common case)", () => {
      expect(getSafeColor("rgba(136, 191, 77, 0.75)")).toBe(
        "rgba(136, 191, 77, 0.75)",
      );
    });

    it("should handle integer RGB with different alpha", () => {
      expect(getSafeColor("rgba(255, 0, 128, 0.5)")).toBe(
        "rgba(255, 0, 128, 0.5)",
      );
    });
  });

  describe("scientific notation", () => {
    it("should handle scientific notation in alpha (negative exponent)", () => {
      expect(getSafeColor("rgba(136, 191, 77, 7.5e-7)")).toBe(
        "rgba(136, 191, 77, 0.000001)",
      );
    });

    it("should handle very small alpha values in scientific notation", () => {
      expect(getSafeColor("rgba(136, 191, 77, 1e-10)")).toBe(
        "rgba(136, 191, 77, 0)",
      );
    });

    it("should handle scientific notation in RGB components", () => {
      expect(getSafeColor("rgba(1.36e+2, 1.91e+2, 7.7e+1, 0.75)")).toBe(
        "rgba(136, 191, 77, 0.75)",
      );
    });

    it("should handle uppercase E in scientific notation", () => {
      expect(getSafeColor("rgba(136, 191, 77, 7.5E-7)")).toBe(
        "rgba(136, 191, 77, 0.000001)",
      );
    });

    it("should handle scientific notation with positive exponent", () => {
      expect(getSafeColor("rgba(1e+2, 2e+2, 5e+1, 1e+0)")).toBe(
        "rgba(100, 200, 50, 1)",
      );
    });
  });

  describe("alpha clamping", () => {
    it("should clamp alpha values above 1", () => {
      expect(getSafeColor("rgba(136, 191, 77, 1.5)")).toBe(
        "rgba(136, 191, 77, 1)",
      );
    });

    it("should clamp negative alpha values to 0", () => {
      expect(getSafeColor("rgba(136, 191, 77, -0.1)")).toBe(
        "rgba(136, 191, 77, 0)",
      );
    });

    it("should clamp very large alpha values", () => {
      expect(getSafeColor("rgba(100, 150, 200, 10)")).toBe(
        "rgba(100, 150, 200, 1)",
      );
    });
  });

  describe("whitespace handling", () => {
    it("should handle extra whitespace", () => {
      expect(getSafeColor("rgba( 136 , 191 , 77 , 0.75 )")).toBe(
        "rgba(136, 191, 77, 0.75)",
      );
    });

    it("should handle no spaces", () => {
      expect(getSafeColor("rgba(136,191,77,0.75)")).toBe(
        "rgba(136, 191, 77, 0.75)",
      );
    });

    it("should handle tabs and multiple spaces", () => {
      expect(getSafeColor("rgba(  136  ,  191  ,  77  ,  0.75  )")).toBe(
        "rgba(136, 191, 77, 0.75)",
      );
    });
  });

  describe("non-RGBA colors", () => {
    it("should return unchanged string if no RGBA pattern matches", () => {
      const color = "rgb(255, 0, 0)";
      expect(getSafeColor(color)).toBe(color);
    });

    it("should return unchanged string for hex colors", () => {
      const color = "#ff0000";
      expect(getSafeColor(color)).toBe(color);
    });

    it("should return unchanged string for named colors", () => {
      const color = "red";
      expect(getSafeColor(color)).toBe(color);
    });

    it("should handle empty string", () => {
      expect(getSafeColor("")).toBe("");
    });
  });
});
