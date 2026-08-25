import type { SeriesSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import type { ComputedVisualizationSettings } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import type { ComboChartDataDensity, DataKey, Datum } from "../model/types";

import {
  formatStackTotalLabel,
  formatStackValuePercentage,
  getShowSymbol,
  getStackValuePercentage,
} from "./series";

const column = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/Integer",
});

const createSettings = (
  overrides: Partial<ComputedVisualizationSettings> = {},
) =>
  createMockVisualizationSettings({
    column: () => ({ number_separators: ".," }),
    ...overrides,
  });

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

describe("formatStackValuePercentage", () => {
  const settings = createSettings();

  it.each([
    [0.6, "60%"],
    [1 / 3, "33.33%"],
    [0.125, "12.50%"],
    [-0.75, "-75%"],
    [-1, "-100%"],
  ])("formats %s as %s", (percentage, expected) => {
    expect(formatStackValuePercentage(percentage, column, settings)).toBe(
      expected,
    );
  });
});

describe("formatStackTotalLabel", () => {
  const rawValueFormatter = (value: unknown) => `raw:${value}`;

  it.each([
    [100, "100%"],
    [-40, "-100%"],
  ])(
    "formats a %s stack total as a signed percentage when showing both",
    (stackValue, expected) => {
      const settings = createSettings({
        "graph.show_stack_values": "all",
        "graph.stack_value_format": "percentage",
      });

      expect(
        formatStackTotalLabel(
          stackValue,
          stackValue,
          column,
          rawValueFormatter,
          settings,
        ),
      ).toBe(expected);
    },
  );

  it("does not display a percentage for a zero total", () => {
    const settings = createSettings({
      "graph.show_stack_values": "all",
      "graph.stack_value_format": "percentage",
    });

    expect(
      formatStackTotalLabel(0, 0, column, rawValueFormatter, settings),
    ).toBe("");
  });

  it.each([
    ["all", "value"],
    ["total", "percentage"],
  ] as const)(
    "keeps the raw total for show_stack_values=%s and stack_value_format=%s",
    (showStackValues, stackValueFormat) => {
      const settings = createSettings({
        "graph.show_stack_values": showStackValues,
        "graph.stack_value_format": stackValueFormat,
      });

      expect(
        formatStackTotalLabel(100, 42, column, rawValueFormatter, settings),
      ).toBe("raw:42");
    },
  );
});

const createDataDensity = (
  numberOfDotsBySeriesKey: Record<DataKey, number>,
): ComboChartDataDensity => ({
  type: "combo",
  seriesDataKeysWithLabels: [],
  stackedDisplayWithLabels: [],
  numberOfDotsBySeriesKey,
  averageLabelWidth: 0,
  totalNumberOfLabels: 0,
});

// With chartWidth 800 and symbolSize 6, Auto mode hides dots once the densest
// series holds more than maxNumberOfDots = 800 / (2 * 6) ≈ 66 points.
const CHART_WIDTH = 800;

const DENSE_SERIES = "dense";
const SPARSE_SERIES = "sparse";
const SINGLE_POINT_SERIES = "single-point";

const AUTO: SeriesSettings = {};
const MARKERS_ON: SeriesSettings = { "line.marker_enabled": true };
const MARKERS_OFF: SeriesSettings = { "line.marker_enabled": false };
const MISSING_AS_ZERO: SeriesSettings = { "line.missing": "zero" };

// The chart reported in metabase#76723
const reportedChartDensity = () =>
  createDataDensity({
    [DENSE_SERIES]: 48,
    [SPARSE_SERIES]: 48,
    [SINGLE_POINT_SERIES]: 1,
  });

const crowdedChartDensity = () =>
  createDataDensity({
    [DENSE_SERIES]: 200,
    [SPARSE_SERIES]: 12,
    [SINGLE_POINT_SERIES]: 1,
  });

describe("getShowSymbol", () => {
  describe("Auto mode (line.marker_enabled unset)", () => {
    it("shows dots when no single series crosses the threshold, even if the chart as a whole does (metabase#76723)", () => {
      expect(
        getShowSymbol(reportedChartDensity(), CHART_WIDTH, AUTO, DENSE_SERIES),
      ).toBe(true);
    });

    it("hides dots for a sparse series when another series in the chart is over the threshold", () => {
      expect(
        getShowSymbol(crowdedChartDensity(), CHART_WIDTH, AUTO, SPARSE_SERIES),
      ).toBe(false);
    });

    it("shows the dot for a single-point series even when another series is over the threshold", () => {
      expect(
        getShowSymbol(
          crowdedChartDensity(),
          CHART_WIDTH,
          AUTO,
          SINGLE_POINT_SERIES,
        ),
      ).toBe(true);
    });

    it("does not exempt a single-point series whose missing values are drawn as zeros, since it has a line", () => {
      expect(
        getShowSymbol(
          crowdedChartDensity(),
          CHART_WIDTH,
          MISSING_AS_ZERO,
          SINGLE_POINT_SERIES,
        ),
      ).toBe(false);
    });
  });

  describe("precedence", () => {
    it("shows dots when markers are On, overriding the density threshold", () => {
      expect(
        getShowSymbol(
          crowdedChartDensity(),
          CHART_WIDTH,
          MARKERS_ON,
          DENSE_SERIES,
        ),
      ).toBe(true);
    });

    it("hides dots when markers are Off, overriding the single-point exemption", () => {
      expect(
        getShowSymbol(
          crowdedChartDensity(),
          CHART_WIDTH,
          MARKERS_OFF,
          SINGLE_POINT_SERIES,
        ),
      ).toBe(false);
    });

    it("hides dots when the chart has no width, overriding the single-point exemption", () => {
      expect(
        getShowSymbol(crowdedChartDensity(), 0, AUTO, SINGLE_POINT_SERIES),
      ).toBe(false);
    });
  });
});
