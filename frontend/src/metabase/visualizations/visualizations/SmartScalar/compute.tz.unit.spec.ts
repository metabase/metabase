import { color } from "metabase/ui/colors";
import { computeTrend } from "metabase/visualizations/visualizations/SmartScalar/compute";
import type { RowValue, SmartScalarComparison } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";
import {
  createMockColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockInsight } from "metabase-types/api/mocks/insight";

import { COMPARISON_TYPES } from "./constants";

// The comparison label condenses same-day/same-year date parts based on the
// wall-clock values, so it must render identically in every machine timezone.
// This runs under the multi-timezone harness (`bun run test-timezones`), which
// would have caught the moment -> dayjs regression where `isSame` went through
// the machine-local frame (fixed in computeComparisonStrPreviousValue).
describe("SmartScalar > compute > comparison labels are timezone-stable", () => {
  const cols = [
    createMockColumn({
      name: "Hour",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
      semantic_type: null,
      source: "breakout",
    }),
    createMockColumn({
      name: "Count",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      semantic_type: "type/Number",
      source: "aggregation",
    }),
  ];

  const getComparisonDescStr = ({
    rows,
    dateUnit,
    comparison,
  }: {
    rows: RowValue[][];
    dateUnit: Insight["unit"];
    comparison: SmartScalarComparison;
  }) => {
    const series = [createMockSingleSeries({}, { data: { rows, cols } })];
    const insights = [createMockInsight({ col: "Count", unit: dateUnit })];
    const settings = createMockVisualizationSettings({
      "scalar.field": "Count",
      "scalar.comparisons": [comparison],
    });

    const { trend } = computeTrend(series, insights, settings, {
      getColor: color,
    });

    return trend?.comparisons[0]?.comparisonDescStr;
  };

  const previousValue: SmartScalarComparison = {
    id: "1",
    type: COMPARISON_TYPES.PREVIOUS_VALUE,
  };

  const threePeriodsAgo: SmartScalarComparison = {
    id: "1",
    type: COMPARISON_TYPES.PERIODS_AGO,
    value: 3,
  };

  const cases: Array<{
    description: string;
    rows: RowValue[][];
    dateUnit: Insight["unit"];
    comparison: SmartScalarComparison;
    expected: string;
  }> = [
    {
      description: "condenses the day for an hours periods-ago comparison",
      rows: [
        ["2022-12-01T07:00", 100],
        ["2022-12-01T10:00", 300],
      ],
      dateUnit: "hour",
      comparison: threePeriodsAgo,
      expected: "vs. 7:00–59 AM",
    },
    {
      description: "condenses year and day when hours are in the same day",
      rows: [
        ["2019-11-05T04:00:00", 100],
        ["2019-11-05T10:00:00", 300],
      ],
      dateUnit: "hour",
      comparison: previousValue,
      expected: "vs. 4:00–59 AM",
    },
    {
      description: "condenses year and day when minutes are in the same day",
      rows: [
        ["2019-11-05T04:00:00", 100],
        ["2019-11-05T10:00:00", 300],
      ],
      dateUnit: "minute",
      comparison: previousValue,
      expected: "vs. 4:00 AM",
    },
    {
      description: "keeps the day when hours are on different days",
      rows: [
        ["2019-10-30T04:00:00", 100],
        ["2019-11-05T10:00:00", 300],
      ],
      dateUnit: "hour",
      comparison: previousValue,
      expected: "vs. Oct 30, 4:00–59 AM",
    },
  ];

  it.each(cases)("$description", ({ rows, dateUnit, comparison, expected }) => {
    expect(getComparisonDescStr({ rows, dateUnit, comparison })).toBe(expected);
  });
});
