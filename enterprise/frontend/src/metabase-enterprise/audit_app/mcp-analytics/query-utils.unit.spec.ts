import type {
  LegacyDatasetQuery,
  StructuredDatasetQuery,
  StructuredQuery,
} from "metabase-types/api";

import { withEventsPage } from "./query-utils";

const structuredQuery: StructuredDatasetQuery = {
  database: 1,
  type: "query",
  query: { "source-table": 10, "order-by": [["desc", ["field", 1, null]]] },
};

/** Apply pagination and narrow the result to its structured `query` map for assertions. */
function pagedQuery(
  jsQuery: LegacyDatasetQuery,
  page: number,
  pageSize: number,
): StructuredQuery {
  const result = withEventsPage(jsQuery, page, pageSize);
  if (result.type !== "query") {
    throw new Error("expected a structured query");
  }
  return result.query;
}

describe("withEventsPage", () => {
  it("adds a 1-indexed MBQL :page clause for the (0-indexed) page", () => {
    expect(pagedQuery(structuredQuery, 0, 25)).toMatchObject({
      page: { page: 1, items: 25 },
    });
    expect(pagedQuery(structuredQuery, 3, 25)).toMatchObject({
      page: { page: 4, items: 25 },
    });
  });

  it("preserves the existing query clauses", () => {
    expect(pagedQuery(structuredQuery, 1, 10)).toMatchObject({
      "source-table": 10,
      "order-by": [["desc", ["field", 1, null]]],
      page: { page: 2, items: 10 },
    });
  });

  it("does not mutate the input query", () => {
    const input: StructuredDatasetQuery = {
      database: 1,
      type: "query",
      query: { "source-table": 10 },
    };
    withEventsPage(input, 2, 25);
    expect(input.query).toEqual({ "source-table": 10 });
  });

  it("no-ops for native queries", () => {
    const native: LegacyDatasetQuery = {
      database: 1,
      type: "native",
      native: { query: "select 1" },
    };
    expect(withEventsPage(native, 2, 25)).toBe(native);
  });
});
