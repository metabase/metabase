import { createMockTable } from "metabase-types/api/mocks";

import { computeAnalysisSettings } from "./config";
import type { AnalysisContext } from "./types";

const CONTEXT: AnalysisContext = { table: createMockTable() };

const HABIT_DEFAULTS = {
  date_range: "past90days",
  counting: "person",
  granularity: "day",
};

describe("computeAnalysisSettings", () => {
  it("gives every setting a default when nothing is stored", () => {
    expect(computeAnalysisSettings("habit", CONTEXT, {})).toEqual(
      HABIT_DEFAULTS,
    );
  });

  it("keeps stored values that are valid for the kind", () => {
    expect(
      computeAnalysisSettings("habit", CONTEXT, {
        date_range: "2026-01-01~2026-03-31",
        counting: "person",
        granularity: "week",
      }),
    ).toEqual({
      date_range: "2026-01-01~2026-03-31",
      counting: "person",
      granularity: "week",
    });
  });

  it.each([
    ["a relative date range", "past30days"],
    ["a date range starting on a date", "2026-01-01~"],
  ])("keeps %s", (_description, dateRange) => {
    expect(
      computeAnalysisSettings("habit", CONTEXT, { date_range: dateRange }),
    ).toEqual({ ...HABIT_DEFAULTS, date_range: dateRange });
  });

  it.each([
    ["a counting option the kind doesn't offer", { counting: "session" }],
    ["an unknown counting option", { counting: "company" }],
    ["a granularity the kind doesn't offer", { granularity: "month" }],
    ["a date range that can't be parsed", { date_range: "not a date" }],
    ["a date filter that isn't a range", { date_range: "exclude-days-Mon" }],
    ["a date range that isn't a string", { date_range: 90 }],
  ])("falls back to the default for %s", (_description, stored) => {
    expect(computeAnalysisSettings("habit", CONTEXT, stored)).toEqual(
      HABIT_DEFAULTS,
    );
  });

  it("drops stored keys the kind doesn't have", () => {
    expect(
      computeAnalysisSettings("habit", CONTEXT, {
        "funnel.window": { value: 1, unit: "day" },
        "columns.person": "user_id",
      }),
    ).toEqual(HABIT_DEFAULTS);
  });
});
