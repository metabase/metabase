import { mapChartColorsToAccents } from "./accents";

describe("mapChartColorsToAccents", () => {
  it("maps string colors to accent keys", () => {
    const result = mapChartColorsToAccents(["#ff0000", "#00ff00", "#0000ff"]);

    expect(result).toEqual({
      accent0: "#ff0000",
      accent1: "#00ff00",
      accent2: "#0000ff",
    });
  });

  it("maps object colors with base, tint and shade", () => {
    const result = mapChartColorsToAccents([
      { base: "#ff0000", tint: "#ff8888", shade: "#880000" },
    ]);

    expect(result).toEqual({
      accent0: "#ff0000",
      "accent0-light": "#ff8888",
      "accent0-dark": "#880000",
    });
  });

  it("handles mixed string and object color formats", () => {
    const result = mapChartColorsToAccents([
      "#ff0000",
      { base: "#00ff00", tint: "#88ff88" },
    ]);

    expect(result).toEqual({
      accent0: "#ff0000",
      accent1: "#00ff00",
      "accent1-light": "#88ff88",
    });
  });

  it("only maps the first 8 colors", () => {
    const nineColors = Array.from({ length: 9 }, () => "#ff0000");
    const result = mapChartColorsToAccents(nineColors);

    expect(Object.keys(result)).toHaveLength(8);
    expect(result).not.toHaveProperty("accent8");
  });

  it("skips defining accent1 if index 1 is null", () => {
    const result = mapChartColorsToAccents(["#ff0000", null, "#0000ff"]);

    expect(result).toEqual({ accent0: "#ff0000", accent2: "#0000ff" });
  });
});
