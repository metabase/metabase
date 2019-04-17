import * as Query from "metabase/lib/query/query";

describe("Query", () => {
  describe("isBareRowsAggregation", () => {
    it("should return true for all bare rows variation", () => {
      expect(Query.isBareRows({})).toBe(true);
      expect(Query.isBareRows({ aggregation: null })).toBe(true); // deprecated
      expect(Query.isBareRows({ aggregation: [] })).toBe(true); // deprecated
    });
    it("should return false for other aggregations", () => {
      expect(Query.isBareRows({ aggregation: [["count"]] })).toBe(false);
      expect(Query.isBareRows({ aggregation: ["count"] })).toBe(false); // deprecated
    });
  });
  describe("getAggregations", () => {
    it("should return an empty list for bare rows", () => {
      expect(Query.getAggregations({})).toEqual([]);
      expect(Query.getAggregations({ aggregation: [["rows"]] })).toEqual([]);
      expect(Query.getAggregations({ aggregation: ["rows"] })).toEqual([]); // deprecated
    });
    it("should return a single aggregation", () => {
      expect(Query.getAggregations({ aggregation: [["count"]] })).toEqual([
        ["count"],
      ]);
      expect(Query.getAggregations({ aggregation: ["count"] })).toEqual([
        ["count"],
      ]); // deprecated
    });
    it("should return multiple aggregations", () => {
      expect(
        Query.getAggregations({ aggregation: [["count"], ["sum", 1]] }),
      ).toEqual([["count"], ["sum", 1]]);
    });
  });
  describe("addAggregation", () => {
    it("should add one aggregation", () => {
      expect(Query.addAggregation({}, ["count"])).toEqual({
        aggregation: [["count"]],
      });
    });
    it("should add an aggregation to an existing one", () => {
      expect(
        Query.addAggregation({ aggregation: [["count"]] }, ["sum", 1]),
      ).toEqual({ aggregation: [["count"], ["sum", 1]] });
      // legacy
      expect(
        Query.addAggregation({ aggregation: [["count"]] }, ["sum", 1]),
      ).toEqual({ aggregation: [["count"], ["sum", 1]] });
    });
  });
  describe("updateAggregation", () => {
    it("should update the correct aggregation", () => {
      expect(
        Query.updateAggregation({ aggregation: [["count"], ["sum", 1]] }, 1, [
          "sum",
          2,
        ]),
      ).toEqual({ aggregation: [["count"], ["sum", 2]] });
    });
  });
  describe("removeAggregation", () => {
    it("should remove one of two aggregations", () => {
      expect(
        Query.removeAggregation({ aggregation: [["count"], ["sum", 1]] }, 0),
      ).toEqual({ aggregation: [["sum", 1]] });
    });
    it("should remove the last aggregations", () => {
      expect(Query.removeAggregation({ aggregation: [["count"]] }, 0)).toEqual(
        {},
      );
      expect(Query.removeAggregation({ aggregation: ["count"] }, 0)).toEqual(
        {},
      ); // deprecated
    });
  });
  describe("clearAggregations", () => {
    it("should remove all aggregations", () => {
      expect(Query.clearAggregations({ aggregation: [["count"]] })).toEqual({});
      expect(
        Query.clearAggregations({ aggregation: [["count"], ["sum", 1]] }),
      ).toEqual({});
      expect(Query.clearAggregations({ aggregation: ["count"] })).toEqual({}); // deprecated
    });
  });

  describe("removeBreakout", () => {
    it("should remove sort as well", () => {
      expect(
        Query.removeBreakout({ breakout: [1], "order-by": [["asc", 1]] }, 0),
      ).toEqual({});
      expect(
        Query.removeBreakout({ breakout: [2, 1], "order-by": [["asc", 1]] }, 0),
      ).toEqual({ breakout: [1], "order-by": [["asc", 1]] });
    });
    it("should not remove aggregation sorts", () => {
      expect(
        Query.removeBreakout(
          {
            aggregation: [["count"]],
            breakout: [2, 1],
            "order-by": [["asc", ["aggregation", 0]]],
          },
          0,
        ),
      ).toEqual({
        aggregation: [["count"]],
        breakout: [1],
        "order-by": [["asc", ["aggregation", 0]]],
      });
    });
  });
});
