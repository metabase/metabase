import { color } from "metabase/ui/colors";
import { computeTrend } from "metabase/visualizations/visualizations/SmartScalar/compute";
import type { RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockInsight } from "metabase-types/api/mocks/insight";

import { COMPARISON_TYPES } from "./constants";

// The comparison label drops the date when both points fall on the same day, so
// the day comparison must read the datetime strings the same way in every client
// timezone. compute.unit.spec.ts runs under one timezone and cannot catch drift.
describe("SmartScalar > compute", () => {
  const METRIC_COLUMN = "Count";

  const cols = [
    createMockColumn({
      name: "Hour",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
      semantic_type: null,
      source: "breakout",
    }),
    createMockColumn({
      name: METRIC_COLUMN,
      base_type: "type/Integer",
      effective_type: "type/Integer",
      semantic_type: "type/Number",
      source: "aggregation",
    }),
  ];

  const settings = createMockVisualizationSettings({
    "scalar.field": METRIC_COLUMN,
    "scalar.comparisons": [{ id: "1", type: COMPARISON_TYPES.PREVIOUS_VALUE }],
  });

  const getComparisonDescStr = (rows: RowValue[][]) => {
    const series = [createMockSingleSeries({}, { data: { rows, cols } })];
    const insights = [createMockInsight({ col: METRIC_COLUMN, unit: "hour" })];
    const { trend } = computeTrend(series, insights, settings, {
      getColor: color,
    });

    return trend?.comparisons[0].comparisonDescStr;
  };

  describe("hourly comparison labels", () => {
    it("omits the date early in the day", () => {
      expect(
        getComparisonDescStr([
          ["2019-11-05T04:00:00", 100],
          ["2019-11-05T10:00:00", 300],
        ]),
      ).toBe("vs. 4:00–59 AM");
    });

    it("omits the date late in the day", () => {
      expect(
        getComparisonDescStr([
          ["2019-11-05T17:00:00", 100],
          ["2019-11-05T20:00:00", 300],
        ]),
      ).toBe("vs. 5:00–59 PM");
    });

    it("keeps the date across a day boundary", () => {
      expect(
        getComparisonDescStr([
          ["2019-11-04T20:00:00", 100],
          ["2019-11-05T04:00:00", 300],
        ]),
      ).toBe("vs. Nov 4, 8:00–59 PM");
    });
  });
});
