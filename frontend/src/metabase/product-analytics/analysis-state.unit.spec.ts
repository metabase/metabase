import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { EventTableSettings, Table } from "metabase-types/api";
import { createOrdersTable } from "metabase-types/api/mocks/presets";

import type { HabitSettings } from "./analyses/types";
import { getAnalysisState } from "./analysis-state";

const SETTINGS: HabitSettings = {
  date_range: "past90days",
  counting: "person",
  granularity: "week",
  habit_values: "count",
};

const createEventTable = (eventSettings: EventTableSettings) =>
  createOrdersTable({
    entity_type: "entity/EventTable",
    event_settings: eventSettings,
  });

const EVENT_TABLE = createEventTable({
  "columns.timestamp": "CREATED_AT",
  "columns.person": "USER_ID",
});

type SetupOpts = {
  table?: Table;
  settings?: HabitSettings;
};

const setup = ({ table = EVENT_TABLE, settings = SETTINGS }: SetupOpts = {}) =>
  getAnalysisState({
    kind: "habit",
    settings,
    table,
    metadataProvider: SAMPLE_PROVIDER,
  });

const getClauseNames = (
  query: Lib.Query,
  stageIndex: number,
  clauses: Lib.Clause[],
) =>
  clauses.map(
    (clause) => Lib.displayInfo(query, stageIndex, clause).displayName,
  );

describe("getAnalysisState", () => {
  it("gives the planner the table's columns for each role", () => {
    const query = Lib.buildProductAnalyticsQuery(setup());

    expect(getClauseNames(query, 0, Lib.breakouts(query, 0))).toEqual([
      "User ID",
    ]);
    expect(getClauseNames(query, 0, Lib.aggregations(query, 0))).toEqual([
      "Distinct values of Created At: Week",
    ]);
  });

  it("gives a query with the planner's result columns", () => {
    const query = Lib.buildProductAnalyticsQuery(setup());

    expect(
      Lib.returnedColumns(query, -1).map(
        (column) => Lib.displayInfo(query, -1, column).name,
      ),
    ).toEqual(["periods", "people"]);
  });

  it("filters events to the date range", () => {
    const query = Lib.buildProductAnalyticsQuery(setup());

    expect(getClauseNames(query, 0, Lib.filters(query, 0))).toEqual([
      "Created At is in the previous 90 days",
    ]);
  });

  it("throws when the date range isn't one the date picker can produce", () => {
    const settings = { ...SETTINGS, date_range: "not a date range" };

    expect(() => setup({ settings })).toThrow("Invalid date range");
  });

  it("throws when the table lacks a column for a role", () => {
    const table = createEventTable({
      "columns.timestamp": "CREATED_AT",
      "columns.person": "NOT_A_COLUMN",
    });

    expect(() => setup({ table })).toThrow("No person column");
  });
});
