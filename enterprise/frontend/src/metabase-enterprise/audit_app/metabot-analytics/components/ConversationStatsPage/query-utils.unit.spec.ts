import type { DateFilterValue } from "metabase/querying/common/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { VIEW_USAGE_LOG } from "../../constants";

import {
  addCountDistinctAggregation,
  applyNotNullFilter,
  applyUsageStatsAggregation,
  getMetricSeriesSettings,
  getViewForMetric,
  isSingleDayFilter,
} from "./query-utils";

describe("getViewForMetric", () => {
  it("routes all metrics to v_ai_usage_log", () => {
    expect(getViewForMetric("tokens")).toBe(VIEW_USAGE_LOG);
    expect(getViewForMetric("conversations")).toBe(VIEW_USAGE_LOG);
    expect(getViewForMetric("messages")).toBe(VIEW_USAGE_LOG);
  });
});

describe("addCountDistinctAggregation", () => {
  it("adds a distinct-count aggregation on the named column", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const result = addCountDistinctAggregation(query, "USER_ID");

    expect(Lib.aggregations(result, 0)).toHaveLength(1);
    const [clause] = Lib.aggregations(result, 0);
    const info = Lib.displayInfo(result, 0, clause);
    expect(info.displayName?.toLowerCase()).toContain("distinct");
  });

  it("returns the query unchanged when the column is not found", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const result = addCountDistinctAggregation(query, "nonexistent_column");
    expect(Lib.aggregations(result, 0)).toHaveLength(0);
  });
});

describe("applyNotNullFilter", () => {
  it("adds a not-null filter on the named column", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const result = applyNotNullFilter(query, "USER_ID");
    expect(Lib.filters(result, 0)).toHaveLength(1);
  });

  it("returns the query unchanged when the column is not found", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const result = applyNotNullFilter(query, "nonexistent_column");
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });
});

describe("applyUsageStatsAggregation", () => {
  it("returns orderColumnName 'count' for the conversations and messages metrics", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    expect(
      applyUsageStatsAggregation(query, "conversations").orderColumnName,
    ).toBe("count");
    expect(applyUsageStatsAggregation(query, "messages").orderColumnName).toBe(
      "count",
    );
  });

  it("returns orderColumnName null for the tokens metric (dual aggregation)", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    expect(
      applyUsageStatsAggregation(query, "tokens").orderColumnName,
    ).toBeNull();
  });
});

describe("getMetricSeriesSettings", () => {
  it("returns two-series config for tokens with both aggregation columns, no stacking, dual axis on opt-in", () => {
    const grouped = getMetricSeriesSettings("tokens", ["sum", "sum_2"]);
    expect(grouped["graph.metrics"]).toEqual(["sum", "sum_2"]);
    expect(grouped.series_settings?.sum?.title).toMatch(/input/i);
    expect(grouped.series_settings?.sum_2?.title).toMatch(/output/i);
    expect(grouped.series_settings?.sum?.axis).toBeUndefined();
    expect(grouped.series_settings?.sum_2?.axis).toBeUndefined();

    const dual = getMetricSeriesSettings("tokens", ["sum", "sum_2"], {
      dualAxis: true,
    });
    expect(dual.series_settings?.sum?.axis).toBe("left");
    expect(dual.series_settings?.sum_2?.axis).toBe("right");
  });

  it("falls back to single-series settings otherwise", () => {
    const settings = getMetricSeriesSettings("conversations");
    expect(settings["graph.metrics"]).toBeUndefined();
    expect(settings.series_settings).toHaveProperty("count");
  });
});

describe("isSingleDayFilter", () => {
  const DAY = new Date(2026, 3, 17);
  const SAME_DAY_LATER = new Date(2026, 3, 17, 23, 59);
  const NEXT_DAY = new Date(2026, 3, 18);

  it("returns true for specific = with a single date and no time", () => {
    const value: DateFilterValue = {
      type: "specific",
      operator: "=",
      values: [DAY],
      hasTime: false,
    };
    expect(isSingleDayFilter(value)).toBe(true);
  });

  it("returns false for specific = when hasTime is on", () => {
    const value: DateFilterValue = {
      type: "specific",
      operator: "=",
      values: [DAY],
      hasTime: true,
    };
    expect(isSingleDayFilter(value)).toBe(false);
  });

  it("returns true for a between range whose endpoints fall on the same calendar day", () => {
    const value: DateFilterValue = {
      type: "specific",
      operator: "between",
      values: [DAY, SAME_DAY_LATER],
      hasTime: false,
    };
    expect(isSingleDayFilter(value)).toBe(true);
  });

  it("returns false for a between range spanning two calendar days", () => {
    const value: DateFilterValue = {
      type: "specific",
      operator: "between",
      values: [DAY, NEXT_DAY],
      hasTime: false,
    };
    expect(isSingleDayFilter(value)).toBe(false);
  });

  it("returns false for >, <, or other operators", () => {
    const gt: DateFilterValue = {
      type: "specific",
      operator: ">",
      values: [DAY],
      hasTime: false,
    };
    expect(isSingleDayFilter(gt)).toBe(false);
  });

  it("returns true for relative day filters covering a single day (today, yesterday, tomorrow)", () => {
    const today: DateFilterValue = {
      type: "relative",
      unit: "day",
      value: 0,
    };
    const yesterday: DateFilterValue = {
      type: "relative",
      unit: "day",
      value: -1,
    };
    const tomorrow: DateFilterValue = {
      type: "relative",
      unit: "day",
      value: 1,
    };
    expect(isSingleDayFilter(today)).toBe(true);
    expect(isSingleDayFilter(yesterday)).toBe(true);
    expect(isSingleDayFilter(tomorrow)).toBe(true);
  });

  it("returns false for relative day filters of other magnitudes", () => {
    const last30: DateFilterValue = {
      type: "relative",
      unit: "day",
      value: -30,
      options: { includeCurrent: true },
    };
    expect(isSingleDayFilter(last30)).toBe(false);
  });

  it("returns false for relative filters with non-day units", () => {
    const lastWeek: DateFilterValue = {
      type: "relative",
      unit: "week",
      value: -1,
    };
    expect(isSingleDayFilter(lastWeek)).toBe(false);
  });

  it("ignores the offset — a 1-day window 7 days ago is still a single day", () => {
    const value: DateFilterValue = {
      type: "relative",
      unit: "day",
      value: -1,
      offsetUnit: "day",
      offsetValue: -7,
    };
    expect(isSingleDayFilter(value)).toBe(true);
  });

  it("returns false for month and quarter filters", () => {
    const month: DateFilterValue = { type: "month", year: 2026, month: 4 };
    const quarter: DateFilterValue = {
      type: "quarter",
      year: 2026,
      quarter: 2,
    };
    expect(isSingleDayFilter(month)).toBe(false);
    expect(isSingleDayFilter(quarter)).toBe(false);
  });

  it("returns false for exclude filters", () => {
    const value: DateFilterValue = {
      type: "exclude",
      operator: "!=",
      unit: "day-of-week",
      values: [1],
    };
    expect(isSingleDayFilter(value)).toBe(false);
  });
});
