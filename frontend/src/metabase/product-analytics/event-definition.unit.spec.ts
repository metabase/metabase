import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestFilterSpec } from "metabase-types/api";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getTableQuery } from "./base-query";
import {
  getConditionsName,
  getEventQuery,
  getQueryEventDefinition,
  readEventDefinition,
  toJsEventDefinition,
} from "./event-definition";

const TABLE_QUERY = getTableQuery(SAMPLE_PROVIDER, ORDERS_ID);

const TOTAL_ABOVE_100: TestFilterSpec = {
  type: "operator",
  operator: ">",
  args: [
    { type: "column", name: "TOTAL" },
    { type: "literal", value: 100 },
  ],
};

const DISCOUNT_BELOW_5: TestFilterSpec = {
  type: "operator",
  operator: "<",
  args: [
    { type: "column", name: "DISCOUNT" },
    { type: "literal", value: 5 },
  ],
};

const getFilteredQuery = (filters: TestFilterSpec[]) =>
  Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID }, filters }],
  });

const toJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const getFilterNames = (query: Lib.Query) =>
  Lib.filters(query, -1).map(
    (filter) => Lib.displayInfo(query, -1, filter).displayName,
  );

describe("readEventDefinition", () => {
  it("reads an event definition back from JSON", () => {
    const event = getQueryEventDefinition(
      getFilteredQuery([TOTAL_ABOVE_100, DISCOUNT_BELOW_5]),
      "Big orders",
    );

    const readEvent = checkNotNull(
      readEventDefinition(toJson(toJsEventDefinition(event))),
    );

    expect(readEvent.name).toBe("Big orders");
    expect(getFilterNames(getEventQuery(TABLE_QUERY, readEvent))).toEqual([
      "Total is greater than 100",
      "Discount is less than 5",
    ]);
  });

  it("keeps the name null while it follows the conditions", () => {
    const event = getQueryEventDefinition(
      getFilteredQuery([TOTAL_ABOVE_100]),
      null,
    );

    expect(
      readEventDefinition(toJson(toJsEventDefinition(event)))?.name,
    ).toBeNull();
  });

  it.each([
    ["nothing", null],
    ["a string", "Big orders"],
    ["no conditions", { name: "Big orders" }],
    ["an empty list of conditions", { name: "Big orders", conditions: [] }],
    ["a condition that isn't a filter", { name: null, conditions: ["x"] }],
  ])("reads %s as null", (_description, value) => {
    expect(readEventDefinition(value)).toBeNull();
  });

  it.each([
    ["a blank name", "  "],
    ["a name that isn't a string", 1],
  ])("reads an event with %s as null", (_description, name) => {
    const { conditions } = toJsEventDefinition(
      getQueryEventDefinition(getFilteredQuery([TOTAL_ABOVE_100]), null),
    );

    expect(readEventDefinition({ name, conditions })).toBeNull();
  });
});

describe("getConditionsName", () => {
  it("is empty without conditions", () => {
    expect(getConditionsName(TABLE_QUERY)).toBe("");
  });

  it("names one condition", () => {
    expect(getConditionsName(getFilteredQuery([TOTAL_ABOVE_100]))).toBe(
      "Total is greater than 100",
    );
  });

  it("joins several conditions with and", () => {
    expect(
      getConditionsName(getFilteredQuery([TOTAL_ABOVE_100, DISCOUNT_BELOW_5])),
    ).toBe("Total is greater than 100 and Discount is less than 5");
  });
});
