import Color from "color";
import { getDefaultChartColors, getAutoChartColors } from "./utils";

describe("getDefaultChartColors", () => {
  const groups = [["accent1"], ["accent2"], ["accent3"]];

  it("should remove custom accent colors", () => {
    const values = {
      brand: "blue",
      accent1: "green",
      accent2: "yellow",
    };

    const newValues = getDefaultChartColors(values, groups);

    expect(newValues).toEqual({
      brand: "blue",
    });
  });
});

describe("getAutoChartColors", () => {
  const groups = [["accent1"], ["accent2"], ["accent3"]];
  const palette = { brand: "blue" };

  it("should fill missing chart colors", () => {
    const values = {
      brand: "blue",
      accent2: "green",
    };

    const newValues = getAutoChartColors(values, groups, palette);

    expect(newValues).toEqual({
      brand: "blue",
      accent1: Color.rgb(138, 230, 230).hex(), // cyan
      accent2: Color.rgb(0, 128, 0).hex(), // green, unchanged
      accent3: Color.rgb(138, 161, 230).hex(), // purple
    });
  });
});
