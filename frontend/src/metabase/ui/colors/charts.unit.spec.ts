import _ from "underscore";

import { getColorsForValues } from "./charts";
import { color } from "./palette";

describe("charts", () => {
  it("should use accent colors for <= 8 series", () => {
    const keys = ["count", "profit", "sum_2"];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toEqual({
      count: color("accent1"), // existing colors are not changed
      profit: color("feedback-positive"), // a preferred color
      sum_2: color("accent6"), // only accent colors are used for other keys
    });
  });

  it("should give stable results <= 8 series", () => {
    const keys = ["count", "profit", "distinct", "sum_2"];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toEqual({
      count: color("accent1"), // existing colors are not changed
      profit: color("feedback-positive"), // a preferred color
      distinct: color("accent4"), // some color based on the hash
      sum_2: color("accent6"), // the same color is used despite different keys count
    });
  });

  it("should use harmony colors for > 8 series", () => {
    const keys = ["count", "sum", "profit", ..._.times(8, (i) => `S${i}`)];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toMatchObject({
      count: color("accent1"), // existing colors are not changed
      sum: color("accent0"), // a color from the palette because accent1 would be preferred, but it's already used
      profit: color("feedback-positive"), // a preferred color
      S0: color("accent0-dark"), // the next color from palette
      S1: color("accent1-dark"), // only dark accents are used when there are <= 16 keys
      S2: color("accent2"),
      S3: color("accent2-dark"),
      S4: color("accent3"),
    });
  });

  it("should reuse colors for > 24 series", () => {
    const keys = ["count", "sum", "profit", ..._.times(48, (i) => `S${i}`)];
    const existingMapping = { count: color("accent1") };

    const newMapping = getColorsForValues(keys, existingMapping);

    expect(newMapping).toMatchObject({
      count: color("accent1"), // existing colors are not changed
      sum: color("accent0"), // a color from the palette because accent1 would be preferred, but it's already used
      profit: color("feedback-positive"), // a preferred color
      S0: color("accent0-light"), // the next color from palette
      S1: color("accent0-dark"), // both light and dark accents are used when there are > 16 series
      S2: color("accent1-light"),
      S3: color("accent1-dark"),
      S4: color("accent2"),
      S28: color("accent2"), // we have 24 colors in the palette, that's why they would repeat after 24 keys
    });
  });

  it("should hash default keys even when series keys are not sorted (metabase#83415)", () => {
    // Visualizer remaps series to COLUMN_N while keeping original names as
    // default keys. Reordering metrics puts COLUMN_N out of sorted order;
    // colors must still follow the original names, not the COLUMN_N index.
    const sortedKeys = ["COLUMN_2", "COLUMN_3"];
    const sortedDefaultKeys = ["revenue", "bookings"];
    const reorderedKeys = ["COLUMN_3", "COLUMN_2"];
    const reorderedDefaultKeys = ["bookings", "revenue"];

    const sortedMapping = getColorsForValues(
      sortedKeys,
      undefined,
      undefined,
      sortedDefaultKeys,
    );
    const reorderedMapping = getColorsForValues(
      reorderedKeys,
      undefined,
      undefined,
      reorderedDefaultKeys,
    );

    expect(reorderedMapping["COLUMN_2"]).toBe(sortedMapping["COLUMN_2"]);
    expect(reorderedMapping["COLUMN_3"]).toBe(sortedMapping["COLUMN_3"]);
    expect(sortedMapping["COLUMN_2"]).not.toBe(sortedMapping["COLUMN_3"]);
  });
});
