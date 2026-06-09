import dayjs from "dayjs";

import type { RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import {
  computeSplit,
  getXAxisDateRangeFromSortedXAxisValues,
  getYAxisModel,
} from "./axis";
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

describe("getYAxisModel splitNumber (issue #69903)", () => {
  const seriesKey = "count";
  const column = createMockColumn({ name: seriesKey });
  const settings = createMockVisualizationSettings();
  const columnByDataKey = { [seriesKey]: column };

  const getSplitNumber = (gridHeight: number | undefined) =>
    getYAxisModel([seriesKey], [seriesKey], [], settings, columnByDataKey, {
      gridSize:
        gridHeight === undefined
          ? undefined
          : { width: 12, height: gridHeight },
    })?.splitNumber;

  it("uses the default tick count for medium-height dashboard charts (height 5)", () => {
    // Regression: previously a height of 5 fell into the "small chart" branch
    // and was forced to 2 ticks, producing excessive whitespace.
    expect(getSplitNumber(5)).toBe(5);
  });

  it("uses the default tick count for height 4", () => {
    expect(getSplitNumber(4)).toBe(5);
  });

  it("uses the default tick count for height 6 and above", () => {
    expect(getSplitNumber(6)).toBe(5);
    expect(getSplitNumber(10)).toBe(5);
  });

  it("uses fewer ticks for genuinely small charts (height <= 3)", () => {
    expect(getSplitNumber(3)).toBe(2);
    expect(getSplitNumber(2)).toBe(2);
    expect(getSplitNumber(1)).toBe(2);
  });

  it("honors the user-configured split number when set", () => {
    const customSettings = createMockVisualizationSettings({
      "graph.y_axis.split_number": 7,
    });
    const result = getYAxisModel(
      [seriesKey],
      [seriesKey],
      [],
      customSettings,
      columnByDataKey,
      { gridSize: { width: 12, height: 5 } },
    );
    expect(result?.splitNumber).toBe(7);
  });

  it("uses the default tick count when no gridSize is provided", () => {
    expect(getSplitNumber(undefined)).toBe(5);
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
