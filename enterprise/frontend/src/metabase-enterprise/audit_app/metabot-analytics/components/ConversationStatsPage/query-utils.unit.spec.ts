import type { DateFilterValue } from "metabase/querying/common/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { VIEW_CONVERSATIONS, VIEW_USAGE_LOG } from "../../constants";

import {
  applyGroupFilter,
  applyUserFilter,
  getMetricSeriesSettings,
  getViewForMetric,
  isSingleDayFilter,
} from "./query-utils";

describe("getViewForMetric", () => {
  it("routes the tokens metric to v_ai_usage_log", () => {
    expect(getViewForMetric("tokens")).toBe(VIEW_USAGE_LOG);
  });

  it("routes conversations and messages to v_metabot_conversations", () => {
    expect(getViewForMetric("conversations")).toBe(VIEW_CONVERSATIONS);
    expect(getViewForMetric("messages")).toBe(VIEW_CONVERSATIONS);
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

describe("applyUserFilter", () => {
  const baseQuery = () =>
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

  it("is a no-op when userId is undefined", () => {
    const q = baseQuery();
    const result = applyUserFilter(q, undefined, "user_id");
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });

  it("adds an equality filter on the named column when present (Orders.USER_ID matches case-insensitively)", () => {
    const q = baseQuery();
    const result = applyUserFilter(q, 42, "user_id");
    const [clause, ...rest] = Lib.filters(result, 0);
    expect(rest).toHaveLength(0);
    const parts = Lib.numberFilterParts(result, 0, clause);
    expect(parts?.operator).toBe("=");
    expect(parts?.values).toEqual([42]);
  });

  it("is a no-op when the column cannot be found on the query", () => {
    const q = baseQuery();
    const result = applyUserFilter(q, 42, "column_that_does_not_exist");
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });
});

describe("applyGroupFilter", () => {
  // Query against PRODUCTS so we can target a real string column (CATEGORY).
  const productsQuery = () =>
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
    });

  it("is a no-op when groupName is undefined", () => {
    const result = applyGroupFilter(productsQuery(), undefined, "category");
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });

  it("adds an equality filter on the named string column when present", () => {
    const result = applyGroupFilter(productsQuery(), "Admins", "category");
    const [clause, ...rest] = Lib.filters(result, 0);
    expect(rest).toHaveLength(0);
    const parts = Lib.stringFilterParts(result, 0, clause);
    expect(parts?.operator).toBe("=");
    expect(parts?.values).toEqual(["Admins"]);
  });

  it("is a no-op when the column cannot be found on the query", () => {
    const result = applyGroupFilter(
      productsQuery(),
      "Admins",
      "column_that_does_not_exist",
    );
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });
});
