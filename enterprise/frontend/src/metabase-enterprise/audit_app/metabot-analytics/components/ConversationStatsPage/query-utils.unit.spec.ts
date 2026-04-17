import type { DateFilterValue } from "metabase/querying/common/types";

import { isSingleDayFilter } from "./query-utils";

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
