import { times } from "lodash";
import { color } from "./palette";
import { getColorsForValues } from "./charts";

describe("getColorsForValues", () => {
  it("should use harmony colors when there are many series", () => {
    const keys = ["count", "sum", "profit", ...times(8, i => `S${i}`)];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toEqual({
      count: color("accent1"),
      sum: color("accent0"),
      profit: color("success"),
      S0: color("accent0-light"),
      S1: color("accent0-dark"),
      S2: color("accent1-light"),
      S3: color("accent1-dark"),
      S4: color("accent2"),
      S5: color("accent2-light"),
      S6: color("accent2-dark"),
      S7: color("accent3"),
    });
  });
});
