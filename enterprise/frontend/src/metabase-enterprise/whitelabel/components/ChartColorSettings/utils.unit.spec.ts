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

  it("should use the brand color for the first chart color when there are no custom colors", () => {
    const values = {
      brand: "blue",
    };

    const newValues = getAutoChartColors(values, groups, palette);

    expect(newValues).toEqual({
      brand: "blue",
      accent1: Color.rgb(0, 0, 255).hex(), // blue, brand
      accent2: Color.rgb(207, 138, 230).hex(), // generated
      accent3: Color.rgb(230, 138, 184).hex(), // generated
    });
  });

  it("should fill missing chart colors without overwriting existing values", () => {
    const values = {
      brand: "blue",
      accent2: "green",
      "accent2-light": "red",
    };

    const newValues = getAutoChartColors(values, groups, palette);

    expect(newValues).toEqual({
      brand: "blue", // unchanged
      "accent2-light": "red", // unchanged
      accent1: Color.rgb(138, 230, 230).hex(), // generated
      accent2: Color.rgb(0, 128, 0).hex(), // green, unchanged
      accent3: Color.rgb(138, 161, 230).hex(), // generated
    });
  });
});
