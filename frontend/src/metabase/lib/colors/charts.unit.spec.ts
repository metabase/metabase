import { times } from "lodash";
import { color } from "./palette";
import { getColorsForValues } from "./charts";

describe("getColorsForValues", () => {
  it("should use accent colors for <= 8 series", () => {
    const keys = ["count", "profit", "sum_2"];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toEqual({
      count: color("accent1"),
      profit: color("success"),
      sum_2: color("accent6"),
    });
  });

  it("should give stable results <= 8 series", () => {
    const keys = ["count", "profit", "distinct", "sum_2"];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toEqual({
      count: color("accent1"),
      profit: color("success"),
      distinct: color("accent4"),
      sum_2: color("accent6"),
    });
  });

  it("should use harmony colors for > 8 series", () => {
    const keys = ["count", "sum", "profit", ...times(8, i => `S${i}`)];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toMatchObject({
      count: color("accent1"),
      sum: color("accent0"),
      profit: color("success"),
      S0: color("accent0-light"),
      S1: color("accent0-dark"),
      S2: color("accent1-light"),
      S3: color("accent1-dark"),
      S4: color("accent2"),
    });
  });

  it("should reuse colors for > 24 series", () => {
    const keys = ["count", "sum", "profit", ...times(48, i => `S${i}`)];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toMatchObject({
      count: color("accent1"),
      sum: color("accent0"),
      profit: color("success"),
      S0: color("accent0-light"),
      S1: color("accent0-dark"),
      S2: color("accent1-light"),
      S3: color("accent1-dark"),
      S4: color("accent2"),
      S28: color("accent2"),
    });
  });
});
