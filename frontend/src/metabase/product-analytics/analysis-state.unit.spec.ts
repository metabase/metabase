import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { EventTableSettings, Table } from "metabase-types/api";
import { ORDERS_ID, createOrdersTable } from "metabase-types/api/mocks/presets";

import type { HabitSettings } from "./analyses/types";
import { getAnalysisState } from "./analysis-state";
import { getTableQuery } from "./base-query";
import {
  type JsEventDefinition,
  getEventQuery,
  getQueryEventDefinition,
  toJsEventDefinition,
} from "./event-definition";

const TABLE_QUERY = getTableQuery(SAMPLE_PROVIDER, ORDERS_ID);

const SETTINGS: HabitSettings = {
  base_query: Lib.toJsQuery(TABLE_QUERY),
  date_range: "past90days",
  counting: "person",
  granularity: "week",
  "habit.active": null,
  "habit.values": "count",
};

const getStoredEvent = (minimumTotal: number) =>
  toJsEventDefinition(
    getQueryEventDefinition(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            filters: [
              {
                type: "operator",
                operator: ">",
                args: [
                  { type: "column", name: "TOTAL" },
                  { type: "literal", value: minimumTotal },
                ],
              },
            ],
          },
        ],
      }),
      null,
    ),
  );

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
  baseQuery?: Lib.Query;
};

const setup = ({
  table = EVENT_TABLE,
  settings = SETTINGS,
  baseQuery = TABLE_QUERY,
}: SetupOpts = {}) =>
  getAnalysisState({ kind: "habit", settings, table, baseQuery });

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

  it("keeps the base query's filters, before the date range's", () => {
    const baseQuery = Lib.createTestQuery(SAMPLE_PROVIDER, {
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
    const query = Lib.buildProductAnalyticsQuery(setup({ baseQuery }));

    expect(getClauseNames(query, 0, Lib.filters(query, 0))).toEqual([
      "Total is greater than 100",
      "Created At is in the previous 90 days",
    ]);
  });

  it("gives the planner the active event", () => {
    const settings = { ...SETTINGS, "habit.active": getStoredEvent(100) };

    const event = checkNotNull(setup({ settings })["habit.active"]);
    const query = getEventQuery(TABLE_QUERY, event);

    expect(getClauseNames(query, -1, Lib.filters(query, -1))).toEqual([
      "Total is greater than 100",
    ]);
  });

  it("builds a query that depends on the active event", () => {
    const buildQuery = (event: JsEventDefinition | null) =>
      Lib.toJsQuery(
        Lib.buildProductAnalyticsQuery(
          setup({ settings: { ...SETTINGS, "habit.active": event } }),
        ),
      );

    expect(
      Lib.areQueriesEqual(
        buildQuery(getStoredEvent(100)),
        buildQuery(getStoredEvent(100)),
      ),
    ).toBe(true);
    expect(
      Lib.areQueriesEqual(buildQuery(getStoredEvent(100)), buildQuery(null)),
    ).toBe(false);
    expect(
      Lib.areQueriesEqual(
        buildQuery(getStoredEvent(100)),
        buildQuery(getStoredEvent(200)),
      ),
    ).toBe(false);
  });

  it("builds a query that depends on the values", () => {
    const buildQuery = (values: HabitSettings["habit.values"]) =>
      Lib.toJsQuery(
        Lib.buildProductAnalyticsQuery(
          setup({ settings: { ...SETTINGS, "habit.values": values } }),
        ),
      );

    expect(
      Lib.areQueriesEqual(buildQuery("percent"), buildQuery("percent")),
    ).toBe(true);
    expect(
      Lib.areQueriesEqual(buildQuery("count"), buildQuery("percent")),
    ).toBe(false);
  });

  it("gives the planner no event when every event counts", () => {
    expect(setup()["habit.active"]).toBeNull();
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
