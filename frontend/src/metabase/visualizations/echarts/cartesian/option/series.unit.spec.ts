import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { Datum } from "metabase/visualizations/echarts/cartesian/model/types";

import { getStackValuePercentage } from "./series";

describe("getStackValuePercentage", () => {
  const datum: Datum = {
    [X_AXIS_DATA_KEY]: "Mixed signs",
    positiveA: 60,
    positiveB: 40,
    negativeA: -30,
    negativeB: -10,
    nullValue: null,
  };
  const seriesKeys = [
    "positiveA",
    "positiveB",
    "negativeA",
    "negativeB",
    "nullValue",
  ];

  it.each([
    ["positiveA", 60, 0.6],
    ["positiveB", 40, 0.4],
    ["negativeA", -30, -0.75],
    ["negativeB", -10, -0.25],
  ])(
    "calculates %s against the total for its sign",
    (_dataKey, value, expected) => {
      expect(getStackValuePercentage(datum, seriesKeys, value)).toBe(expected);
    },
  );

  it("returns undefined when the relevant sign has no non-zero total", () => {
    expect(
      getStackValuePercentage(
        { [X_AXIS_DATA_KEY]: "Zero", first: 0, second: 0 },
        ["first", "second"],
        0,
      ),
    ).toBeUndefined();
  });
});
