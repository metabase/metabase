import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { Datum } from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import {
  formatStackTotalLabel,
  formatStackValuePercentage,
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
