import {
  deriveChartShadeColor,
  deriveChartTintColor,
  mapChartColorsToAccents,
} from "./accents";

describe("mapChartColorsToAccents", () => {
  it("maps string colors to accent keys with derived tint and shade", () => {
    const result = mapChartColorsToAccents(["#FF0000", "#00FF00", "#0000FF"]);

    expect(result).toEqual({
      accent0: "#FF0000",
      "accent0-light": deriveChartTintColor("#FF0000"),
      "accent0-dark": deriveChartShadeColor("#FF0000"),
      accent1: "#00FF00",
      "accent1-light": deriveChartTintColor("#00FF00"),
      "accent1-dark": deriveChartShadeColor("#00FF00"),
      accent2: "#0000FF",
      "accent2-light": deriveChartTintColor("#0000FF"),
      "accent2-dark": deriveChartShadeColor("#0000FF"),
    });
  });

  it("maps object colors with explicit base, tint and shade", () => {
    const result = mapChartColorsToAccents([
      { base: "#FF0000", tint: "#FF8888", shade: "#880000" },
    ]);

    expect(result).toEqual({
      accent0: "#FF0000",
      "accent0-light": "#FF8888",
      "accent0-dark": "#880000",
    });
  });

  it("derives missing tint/shade when object only has base", () => {
    const result = mapChartColorsToAccents([{ base: "#FF0000" }]);

    expect(result).toEqual({
      accent0: "#FF0000",
      "accent0-light": deriveChartTintColor("#FF0000"),
      "accent0-dark": deriveChartShadeColor("#FF0000"),
    });
  });

  it("handles mixed string and object color formats", () => {
    const result = mapChartColorsToAccents([
      "#FF0000",
      { base: "#00FF00", tint: "#88FF88", shade: "#008800" },
    ]);

    expect(result).toEqual({
      accent0: "#FF0000",
      "accent0-light": deriveChartTintColor("#FF0000"),
      "accent0-dark": deriveChartShadeColor("#FF0000"),
      accent1: "#00FF00",
      "accent1-light": "#88FF88",
      "accent1-dark": "#008800",
    });
  });

  it("only maps the first 9 colors (8 + grey)", () => {
    const manyColors = Array.from({ length: 12 }, () => "#FF0000");
    const result = mapChartColorsToAccents(manyColors);

    // 9 base + 9 tint + 9 shade = 27 keys
    expect(Object.keys(result)).toHaveLength(27);

    // accent8 should not exist
    expect(result).not.toHaveProperty("accent8");
    expect(result).not.toHaveProperty("accent8-light");

    // gray should exist
    expect(result).toHaveProperty("accent-gray");
    expect(result).toHaveProperty("accent-gray-light");
  });

  it("skips all variants if color at index is null", () => {
    const result = mapChartColorsToAccents(["#FF0000", null, "#0000FF"]);

    expect(result).toEqual({
      accent0: "#FF0000",
      "accent0-light": deriveChartTintColor("#FF0000"),
      "accent0-dark": deriveChartShadeColor("#FF0000"),
      accent2: "#0000FF",
      "accent2-light": deriveChartTintColor("#0000FF"),
      "accent2-dark": deriveChartShadeColor("#0000FF"),
    });
  });
});

describe("deriveChartTintColor", () => {
  it("derives a lighter variant of the color", () => {
    // Default accent0 blue (#509EE3) should become lighter
    expect(deriveChartTintColor("#509EE3")).toBe("#87BCEC");
  });
});

describe("deriveChartShadeColor", () => {
  it("derives a darker variant of the color", () => {
    // Default accent0 blue (#509EE3) should become darker
    expect(deriveChartShadeColor("#509EE3")).toBe("#227FD2");
  });
});
