import type { DatePickerValue } from "metabase/querying/common/types";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
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

  it.each<[string, DatePickerValue]>([
    ["past days", { type: "relative", value: -30, unit: "day" }],
    ["the current month", { type: "relative", value: 0, unit: "month" }],
    ["next weeks", { type: "relative", value: 2, unit: "week" }],
    [
      "past days, starting earlier",
      {
        type: "relative",
        value: -30,
        unit: "day",
        offsetValue: -1,
        offsetUnit: "month",
      },
    ],
    [
      "a day",
      {
        type: "specific",
        operator: "=",
        values: [new Date(2026, 0, 1)],
        hasTime: false,
      },
    ],
    [
      "before a date",
      {
        type: "specific",
        operator: "<",
        values: [new Date(2026, 0, 1)],
        hasTime: false,
      },
    ],
    [
      "after a date",
      {
        type: "specific",
        operator: ">",
        values: [new Date(2026, 0, 1)],
        hasTime: false,
      },
    ],
    [
      "between dates",
      {
        type: "specific",
        operator: "between",
        values: [new Date(2026, 0, 1), new Date(2026, 2, 31)],
        hasTime: false,
      },
    ],
    [
      "excluded days of the week",
      { type: "exclude", operator: "!=", unit: "day-of-week", values: [1, 7] },
    ],
  ])("keeps a date range from the date picker: %s", (_description, value) => {
    const dateRange = serializeDateParameterValue(value);
    expect(
      computeAnalysisSettings("habit", CONTEXT, { date_range: dateRange }),
    ).toEqual({ ...HABIT_DEFAULTS, date_range: dateRange });
  });

  it.each([
    ["a counting option the kind doesn't offer", { counting: "session" }],
    ["an unknown counting option", { counting: "company" }],
    ["a granularity the kind doesn't offer", { granularity: "month" }],
    ["a date range that can't be parsed", { date_range: "not a date" }],
    ["a month, which the date picker can't produce", { date_range: "2026-03" }],
    [
      "a quarter, which the date picker can't produce",
      { date_range: "Q1-2026" },
    ],
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
