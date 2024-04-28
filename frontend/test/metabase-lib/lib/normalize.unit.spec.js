import { normalize } from "cljs/metabase.legacy_mbql.js";

// This test is here mostly to make sure the shared CLJS lib works correctly.

describe("normalize", () => {
  it("should normalize an MBQL query", () => {
    const query = {
      DATABASE: 1000,
      tYpE: "qUeRY",
      QUeRY: {
        source_TABLE: 200,
        aggREGATION: ["count"],
        filter: ["AND", ["=", 1, ["field-id", 2]]],
      },
    };

    const normalized = {
      database: 1000,
      type: "query",
      query: {
        "source-table": 200,
        aggregation: [["count"]],
        filter: ["=", ["field", 1, null], ["field", 2, null]],
      },
    };

    expect(normalize(query)).toEqual(normalized);
  });
});
