import dayjs from "dayjs";

import type { RowValue } from "metabase-types/api";

import { computeSplit, getXAxisDateRangeFromSortedXAxisValues } from "./axis";
import type { SeriesExtents } from "./types";

describe("computeSplit", () => {
  const extents: SeriesExtents = {
    "1": [6, 8],
    "2": [9, 13],
    "3": [6, 7],
    "4": [1, 1],
    "5": [10, 13],
    "6": [15, 19],
    "7": [5, 6],
    "8": [5, 10],
    "9": [9, 13],
    "10": [2, 6],
    "11": [12, 15],
    "12": [1, 1],
  };

  it("should return the same number of series as given", () => {
    expect(computeSplit(extents).flat()).toHaveLength(
      Object.keys(extents).length,
    );
  });
});

describe("getXAxisDateRangeFromSortedXAxisValues", () => {
  it("should not consider undefined values for the range", () => {
    // Undefined values appear when two timeseries datasets are combined (#64921)
    const range = getXAxisDateRangeFromSortedXAxisValues([
      "2022-03-01T00:00:00Z",
      "2022-04-01T00:00:00Z",
      undefined,
    ] as RowValue[]);
    expect(range).toStrictEqual([
      dayjs.utc("2022-03-01T00:00:00Z"),
      dayjs.utc("2022-04-01T00:00:00Z"),
    ]);
  });
});
