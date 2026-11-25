import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockColumn } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import type { HabitSettings } from "../analyses/types";
import { getTableQuery } from "../base-query";

import { getClickedDrill, getSettingsChanges, isAnalysisDrill } from "./drill";

/** Shape the FE sends for an aggregation column; analysis normalizes to MBQL 5. */
const PERIODS_REF = ["field", "periods", { "base-type": "type/Integer" }];
const COHORT_REF = ["field", "cohort", { "base-type": "type/Date" }];
const BROWSER_REF = ["field", "browser", { "base-type": "type/Text" }];
const CONVERTED_REF = ["field", "converted", { "base-type": "type/Boolean" }];

const DRILL: Lib.AnalysisDrill = {
  type: "actors",
  dimensions: [{ column_ref: PERIODS_REF, value: 6 }],
};

const SETTINGS: HabitSettings = {
  base_query: Lib.toJsQuery(getTableQuery(SAMPLE_PROVIDER, ORDERS_ID)),
  date_range: "past90days",
  counting: "person",
  granularity: "day",
  drill: null,
  "habit.active": null,
  "habit.values": "count",
};

const DRILLED_SETTINGS: HabitSettings = { ...SETTINGS, drill: DRILL };

describe("isAnalysisDrill", () => {
  it.each([
    DRILL,
    {
      type: "actors",
      dimensions: [
        { column_ref: COHORT_REF, value: "2026-10-05" },
        { column_ref: BROWSER_REF, value: null },
        { column_ref: CONVERTED_REF, value: true },
      ],
    },
  ])("accepts a drill the planner can read", (value) => {
    expect(isAnalysisDrill(value)).toBe(true);
  });

  it.each([
    null,
    "actors",
    { ...DRILL, type: "unknown" },
    { ...DRILL, dimensions: [] },
    { ...DRILL, dimensions: [{ column_ref: null, value: 6 }] },
    {
      ...DRILL,
      dimensions: [{ column_ref: PERIODS_REF, value: { count: 6 } }],
    },
    { ...DRILL, dimensions: [{ column_ref: PERIODS_REF }] },
  ])("rejects %j", (value) => {
    expect(isAnalysisDrill(value)).toBe(false);
  });
});

describe("getClickedDrill", () => {
  it("drills to the clicked cell's values, by column ref", () => {
    expect(
      getClickedDrill({
        column: createMockColumn({ name: "people" }),
        value: 120,
        dimensions: [
          {
            column: createMockColumn({
              name: "periods",
              field_ref: PERIODS_REF,
            }),
            value: 6,
          },
        ],
      }),
    ).toEqual(DRILL);
  });

  it("doesn't drill from a click without a cell's values", () => {
    expect(
      getClickedDrill({
        column: createMockColumn({ name: "people" }),
        value: 120,
      }),
    ).toBeNull();
    expect(getClickedDrill({ dimensions: [] })).toBeNull();
  });

  it("doesn't drill to a value that can't be stored", () => {
    expect(
      getClickedDrill({
        dimensions: [
          {
            column: createMockColumn({
              name: "periods",
              field_ref: PERIODS_REF,
            }),
            value: { n: 6 },
          },
        ],
      }),
    ).toBeNull();
  });

  it("doesn't drill from a click whose column has no field_ref", () => {
    expect(
      getClickedDrill({
        dimensions: [
          { column: createMockColumn({ name: "periods" }), value: 6 },
        ],
      }),
    ).toBeNull();
  });
});

describe("getSettingsChanges", () => {
  it("clears the drill when another setting changes", () => {
    expect(
      getSettingsChanges(DRILLED_SETTINGS, { granularity: "week" }),
    ).toEqual({ granularity: "week", drill: null });
  });

  it("keeps the drill when nothing changes", () => {
    expect(
      getSettingsChanges(DRILLED_SETTINGS, { granularity: "day" }),
    ).toBeNull();
  });

  it("changes the drill", () => {
    expect(getSettingsChanges(SETTINGS, { drill: DRILL })).toEqual({
      drill: DRILL,
    });
    expect(getSettingsChanges(DRILLED_SETTINGS, { drill: null })).toEqual({
      drill: null,
    });
  });

  it("stores no drill without one", () => {
    expect(getSettingsChanges(SETTINGS, { granularity: "week" })).toEqual({
      granularity: "week",
    });
  });
});
