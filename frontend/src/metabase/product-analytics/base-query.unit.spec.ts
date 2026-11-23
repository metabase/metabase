import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getTableQuery, readBaseQuery } from "./base-query";

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

const getFilterNames = (query: Lib.Query) =>
  Lib.filters(query, -1).map(
    (filter) => Lib.displayInfo(query, -1, filter).displayName,
  );

describe("getTableQuery", () => {
  it("gives a query on the table with nothing added", () => {
    const query = getTableQuery(SAMPLE_PROVIDER, ORDERS_ID);

    expect(Lib.primarySourceTableId(query)).toBe(ORDERS_ID);
    expect(Lib.stageCount(query)).toBe(1);
    expect(Lib.filters(query, -1)).toHaveLength(0);
  });

  it("throws when the table isn't in the metadata provider", () => {
    expect(() => getTableQuery(SAMPLE_PROVIDER, 999)).toThrow(
      "No metadata for table 999",
    );
  });
});

describe("readBaseQuery", () => {
  it("reads a stored query with its filters", () => {
    const query = readBaseQuery(SAMPLE_PROVIDER, Lib.toJsQuery(FILTERED_QUERY));

    expect(query).not.toBeNull();
    expect(query && getFilterNames(query)).toEqual([
      "Total is greater than 100",
    ]);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["a string", "query"],
    ["an array", []],
    ["an object that isn't a query", { foo: "bar" }],
    ["a query with two stages", Lib.toJsQuery(Lib.appendStage(FILTERED_QUERY))],
  ])("gives null for %s", (_description, value) => {
    expect(readBaseQuery(SAMPLE_PROVIDER, value)).toBeNull();
  });
});
