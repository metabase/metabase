import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockColumn } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import type { HabitSettings } from "../analyses/types";
import { getTableQuery } from "../base-query";

import { getClickedDrill, getSettingsChanges, isAnalysisDrill } from "./drill";

const DRILL: Lib.AnalysisDrill = {
  type: "actors",
  dimensions: [{ column: "periods", value: 6 }],
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
        { column: "cohort", value: "2026-10-05" },
        { column: "browser", value: null },
        { column: "converted", value: true },
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
    { ...DRILL, dimensions: [{ column: 1, value: 6 }] },
    { ...DRILL, dimensions: [{ column: "periods", value: { count: 6 } }] },
    { ...DRILL, dimensions: [{ column: "periods" }] },
  ])("rejects %j", (value) => {
    expect(isAnalysisDrill(value)).toBe(false);
  });
});

describe("getClickedDrill", () => {
  it("drills to the clicked cell's values, by column name", () => {
    expect(
      getClickedDrill({
        column: createMockColumn({ name: "people" }),
        value: 120,
        dimensions: [
          { column: createMockColumn({ name: "periods" }), value: 6 },
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
          { column: createMockColumn({ name: "periods" }), value: { n: 6 } },
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
