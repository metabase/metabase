import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

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
});
