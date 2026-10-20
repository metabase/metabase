import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID, PEOPLE_ID } from "metabase-types/api/mocks/presets";

import { buildBaseQuery } from "./base-query";
import type { ColumnRoles } from "./columns";
import { createFlagAllocator } from "./events/allocate-flags";
import {
  type MockFilter,
  createMockEventDefinition,
  discountBelow,
  totalAbove,
} from "./events/mocks";
import type { EventDefinition } from "./events/types";
import { NO_FILTERS } from "./filters";
import { IN_RANGE_FLAG } from "./sql/analyses/lookback";

const STAGE = -1;

const COLUMNS: ColumnRoles = {
  timestamp: "CREATED_AT",
  person: "USER_ID",
  session: null,
  event_id: "ID",
  event_name: null,
  url_path: null,
};

const createEventDefinition = (...filters: MockFilter[]): EventDefinition =>
  createMockEventDefinition({ name: "Big order", filters });

const getFlagParts = (event: EventDefinition) => {
  const flags = createFlagAllocator();
  flags.flagFor(event);
  const { query } = buildBaseQuery(SAMPLE_PROVIDER, ORDERS_ID, {
    dateRange: "",
    columns: COLUMNS,
    events: flags.events,
    extraColumns: [],
    usersTable: undefined,
    filters: NO_FILTERS,
    lookbackDays: 0,
  });
  const [flag] = Lib.expressions(query, STAGE);
  return {
    name: Lib.displayInfo(query, STAGE, flag).displayName,
    parts: Lib.expressionParts(query, STAGE, flag),
  };
};

describe("buildBaseQuery", () => {
  it("flags an event by its filter", () => {
    expect(getFlagParts(createEventDefinition(totalAbove(100)))).toMatchObject({
      name: "ev_1",
      parts: { operator: "case", args: [{ operator: ">" }, 1, 0] },
    });
  });

  it("flags an event by all of its filters", () => {
    const event = createEventDefinition(totalAbove(100), discountBelow(5));

    expect(getFlagParts(event).parts).toMatchObject({
      operator: "case",
      args: [
        { operator: "and", args: [{ operator: ">" }, { operator: "<" }] },
        1,
        0,
      ],
    });
  });

  it("rejects an event without filters", () => {
    expect(() => getFlagParts(createEventDefinition())).toThrow(
      "Big order has no conditions.",
    );
  });

  it("selects an extra column of the event table", () => {
    const { query, extraColumns } = buildBaseQuery(SAMPLE_PROVIDER, ORDERS_ID, {
      dateRange: "",
      columns: COLUMNS,
      events: [],
      extraColumns: [
        { as: "cohort_start", column: "CREATED_AT", from: "events" },
      ],
      usersTable: undefined,
      filters: NO_FILTERS,
      lookbackDays: 0,
    });

    expect(extraColumns).toEqual([{ as: "cohort_start", alias: "CREATED_AT" }]);
    expect(
      Lib.returnedColumns(query, STAGE).map(
        (column) => Lib.displayInfo(query, STAGE, column).name,
      ),
    ).toEqual(["CREATED_AT", "USER_ID", "ID"]);
  });

  it("left-joins the users table for an extra column of it", () => {
    const { query, extraColumns } = buildBaseQuery(SAMPLE_PROVIDER, ORDERS_ID, {
      dateRange: "",
      columns: COLUMNS,
      events: [],
      extraColumns: [
        { as: "cohort_attribute", column: "SOURCE", from: "users" },
      ],
      usersTable: {
        tableId: PEOPLE_ID,
        foreignKey: "USER_ID",
        primaryKey: "ID",
      },
      filters: NO_FILTERS,
      lookbackDays: 0,
    });

    const [join] = Lib.joins(query, STAGE);
    expect(join).toBeDefined();
    expect(
      Lib.displayInfo(query, STAGE, Lib.joinStrategy(join)).shortName,
    ).toBe("left-join");
    expect(extraColumns).toEqual([
      { as: "cohort_attribute", alias: "People - User__SOURCE" },
    ]);
    expect(
      Lib.returnedColumns(query, STAGE).map(
        (column) => Lib.displayInfo(query, STAGE, column).longDisplayName,
      ),
    ).toEqual(["Created At", "User ID", "ID", "People - User → Source"]);
  });

  it("rejects a users table column without a users table", () => {
    expect(() =>
      buildBaseQuery(SAMPLE_PROVIDER, ORDERS_ID, {
        dateRange: "",
        columns: COLUMNS,
        events: [],
        extraColumns: [
          { as: "cohort_attribute", column: "SOURCE", from: "users" },
        ],
        usersTable: undefined,
        filters: NO_FILTERS,
        lookbackDays: 0,
      }),
    ).toThrow("The person column doesn't link to a users table.");
  });
});

describe("createFlagAllocator", () => {
  it("numbers flags in order of first use", () => {
    const flags = createFlagAllocator();
    const big = createEventDefinition(totalAbove(100));
    const discounted = createEventDefinition(discountBelow(5));

    expect(flags.flagFor(discounted)).toBe("ev_1");
    expect(flags.flagFor(big)).toBe("ev_2");
    expect(flags.events.map(({ event }) => event)).toEqual([discounted, big]);
  });

  it("gives identical events one flag", () => {
    const flags = createFlagAllocator();
    const event = createEventDefinition(totalAbove(100));

    expect(flags.flagFor(event)).toBe("ev_1");
    expect(flags.flagFor({ ...event })).toBe("ev_1");
    expect(flags.events).toHaveLength(1);
  });

  describe("with a lookback", () => {
    const build = (dateRange: string, lookbackDays: number) =>
      buildBaseQuery(SAMPLE_PROVIDER, ORDERS_ID, {
        dateRange,
        columns: COLUMNS,
        events: [],
        extraColumns: [],
        usersTable: undefined,
        filters: NO_FILTERS,
        lookbackDays,
      });

    it("reads the days before the range, and flags the events in it", () => {
      const { query, flags } = build("past30days", 30);
      const [filter] = Lib.filters(query, STAGE);
      const [inRange] = Lib.expressions(query, STAGE);

      expect(Lib.relativeDateFilterParts(query, STAGE, filter)).toMatchObject({
        value: -60,
        unit: "day",
      });
      expect(Lib.displayInfo(query, STAGE, inRange).displayName).toBe(
        IN_RANGE_FLAG,
      );
      expect(Lib.expressionParts(query, STAGE, inRange)).toMatchObject({
        operator: "case",
        args: [{ operator: "time-interval", args: [{}, -30, "day"] }, 1, 0],
      });
      expect(flags).toEqual([IN_RANGE_FLAG]);
    });

    it("flags every event without a date range", () => {
      const { query, flags } = build("", 30);
      const [inRange] = Lib.expressions(query, STAGE);

      expect(Lib.filters(query, STAGE)).toHaveLength(0);
      expect(Lib.expressionParts(query, STAGE, inRange)).toMatchObject({
        operator: "case",
        args: [{ operator: "not-null" }, 1, 0],
      });
      expect(flags).toEqual([IN_RANGE_FLAG]);
    });

    it("adds nothing without one", () => {
      const { query, flags } = build("past30days", 0);

      expect(Lib.expressions(query, STAGE)).toHaveLength(0);
      expect(flags).toEqual([]);
    });
  });
});
