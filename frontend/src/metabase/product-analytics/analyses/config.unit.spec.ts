import type { DatePickerValue } from "metabase/querying/common/types";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID, createOrdersTable } from "metabase-types/api/mocks/presets";

import { getTableQuery } from "../base-query";
import {
  getQueryEventDefinition,
  toJsEventDefinition,
} from "../event-definition";

import { computeAnalysisSettings } from "./config";
import type { AnalysisContext } from "./types";

const CONTEXT: AnalysisContext = {
  table: createOrdersTable(),
  metadataProvider: SAMPLE_PROVIDER,
};

const TABLE_QUERY = getTableQuery(SAMPLE_PROVIDER, ORDERS_ID);

const FILTERED_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      filters: [
        {
          type: "operator",
          operator: ">",
          args: [
            { type: "column", name: "TOTAL" },
            { type: "literal", value: 100 },
          ],
        },
      ],
    },
  ],
});

const EVENT = toJsEventDefinition(
  getQueryEventDefinition(FILTERED_QUERY, "Big orders"),
);

const HABIT_DEFAULTS = {
  base_query: Lib.toJsQuery(TABLE_QUERY),
  date_range: "past90days",
  counting: "person",
  granularity: "day",
  "habit.active": null,
  "habit.values": "count",
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
        base_query: Lib.toJsQuery(FILTERED_QUERY),
        date_range: "2026-01-01~2026-03-31",
        counting: "person",
        granularity: "week",
        "habit.active": EVENT,
        "habit.values": "percent",
      }),
    ).toEqual({
      base_query: Lib.toJsQuery(FILTERED_QUERY),
      date_range: "2026-01-01~2026-03-31",
      counting: "person",
      granularity: "week",
      "habit.active": EVENT,
      "habit.values": "percent",
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
    ["a base query that isn't an object", { base_query: "query" }],
    [
      "a base query with more than one stage",
      { base_query: Lib.toJsQuery(Lib.appendStage(FILTERED_QUERY)) },
    ],
    [
      "an active event without conditions",
      { "habit.active": { ...EVENT, conditions: [] } },
    ],
    ["an active event that isn't an object", { "habit.active": "signup" }],
    ["values Habit doesn't offer", { "habit.values": "ratio" }],
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
