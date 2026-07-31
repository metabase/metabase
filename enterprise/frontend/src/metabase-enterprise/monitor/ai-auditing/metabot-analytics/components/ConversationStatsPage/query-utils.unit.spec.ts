import type { DateFilterValue } from "metabase/querying/common/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { isSingleDayFilter } from "./ConversationsByDayChart";
import {
  applyIdFilter,
  excludeAllUsersGroup,
  getMetricSeriesSettings,
} from "./query-utils";

describe("getMetricSeriesSettings", () => {
  const getColor = (name: string) => `#${name}`;

  it("pins the single aggregation as the metric and colors it per metric type", () => {
    const settings = getMetricSeriesSettings("tokens", getColor, ["sum"]);
    expect(settings["graph.metrics"]).toEqual(["sum"]);
    expect(settings.series_settings?.sum?.color).toBe("#accent2");
  });

  it("leaves series colors to the palette when the model breakout supplies the series", () => {
    const settings = getMetricSeriesSettings("tokens", getColor, ["sum"], {
      hasModelSeries: true,
    });
    expect(settings["graph.metrics"]).toEqual(["sum"]);
    expect(settings.series_settings).toBeUndefined();
  });

  it("falls back to the metric's default column name when none is supplied", () => {
    const settings = getMetricSeriesSettings("conversations", getColor);
    expect(settings["graph.metrics"]).toEqual(["count"]);
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

describe("applyIdFilter", () => {
  const baseQuery = () =>
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

  it("is a no-op when id is undefined", () => {
    const q = baseQuery();
    const result = applyIdFilter(q, "user_id", undefined);
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });

  it("adds an equality filter on the named column when present (Orders.USER_ID matches case-insensitively)", () => {
    const q = baseQuery();
    const result = applyIdFilter(q, "user_id", 42);
    const [clause, ...rest] = Lib.filters(result, 0);
    expect(rest).toHaveLength(0);
    const parts = Lib.numberFilterParts(result, 0, clause);
    expect(parts?.operator).toBe("=");
    expect(parts?.values).toEqual([42]);
  });

  it("is a no-op when the column cannot be found on the query", () => {
    const q = baseQuery();
    const result = applyIdFilter(q, "column_that_does_not_exist", 42);
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });
});

describe("excludeAllUsersGroup", () => {
  const baseQuery = () =>
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

  it("is a no-op when the group_id column isn't on the query (no join yet)", () => {
    const result = excludeAllUsersGroup(baseQuery());
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });

  it("adds a != 1 filter on group_id when the column is present", () => {
    const queryWithGroupId = Lib.expression(
      baseQuery(),
      0,
      "group_id",
      Lib.expressionClause(1),
    );
    const result = excludeAllUsersGroup(queryWithGroupId);
    const [clause, ...rest] = Lib.filters(result, 0);
    expect(rest).toHaveLength(0);
    const parts = Lib.numberFilterParts(result, 0, clause);
    expect(parts?.operator).toBe("!=");
    expect(parts?.values).toEqual([1]);
  });
});
