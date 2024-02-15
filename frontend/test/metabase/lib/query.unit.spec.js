import * as Q_DEPRECATED from "metabase-lib/queries/utils";

describe("Legacy Q_DEPRECATED library", () => {
  describe("removeBreakout", () => {
    it("should not mutate the query", () => {
      const query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, null]],
      };
      Q_DEPRECATED.removeBreakout(query, 0);
      expect(query.breakout).toEqual([["field", 1, null]]);
    });
    it("should remove the dimension", () => {
      let query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, null]],
      };
      query = Q_DEPRECATED.removeBreakout(query, 0);
      expect(query.breakout).toEqual(undefined);
    });
    it("should remove sort clauses for the dimension that was removed", () => {
      let query = {
        "source-table": 0,
        aggregation: [["count"]],
        breakout: [["field", 1, null]],
        "order-by": [["asc", ["field", 1, null]]],
      };
      query = Q_DEPRECATED.removeBreakout(query, 0);
      expect(query["order-by"]).toEqual(undefined);
    });
  });
});

describe("isValidField", () => {
  it("should return true for new-style fk", () => {
    expect(Q_DEPRECATED.isValidField(["field", 2, { "source-field": 1 }])).toBe(
      true,
    );
  });
});
