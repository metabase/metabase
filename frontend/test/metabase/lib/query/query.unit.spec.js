import * as Query from "metabase/lib/query/query";

describe("Query", () => {
  describe("isBareRows", () => {
    it("should return true for no aggregation", () => {
      expect(Query.isBareRows({})).toBe(true);
    });
    it("should return true for no aggregation deprecated form", () => {
      expect(Query.isBareRows({ aggregation: null })).toBe(true); // deprecated
      expect(Query.isBareRows({ aggregation: [] })).toBe(true); // deprecated
    });
    it("should return false for other aggregations", () => {
      expect(Query.isBareRows({ aggregation: [["count"]] })).toBe(false);
    });
    it("should return false for other aggregations deprecated form", () => {
      expect(Query.isBareRows({ aggregation: ["count"] })).toBe(false); // deprecated
    });
  });
  describe("getAggregations", () => {
    it("should return an empty list for bare rows", () => {
      expect(Query.getAggregations({})).toEqual([]);
    });
    it("should return an empty list for bare rows for deprecated form", () => {
      expect(Query.getAggregations({ aggregation: [["rows"]] })).toEqual([]); // deprecated
      expect(Query.getAggregations({ aggregation: ["rows"] })).toEqual([]); // deprecated
    });
    it("should return a single aggregation", () => {
      expect(Query.getAggregations({ aggregation: [["count"]] })).toEqual([
        ["count"],
      ]);
    });
    it("should return a single aggregation for deprecated form", () => {
      expect(Query.getAggregations({ aggregation: ["count"] })) // deprecated
        .toEqual([["count"]]);
    });
    it("should return multiple aggregations", () => {
      expect(
        Query.getAggregations({
          aggregation: [["count"], ["sum", ["field-id", 1]]],
        }),
      ).toEqual([["count"], ["sum", ["field-id", 1]]]);
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
        Query.addAggregation({ aggregation: [["count"]] }, [
          "sum",
          ["field-id", 1],
        ]),
      ).toEqual({ aggregation: [["count"], ["sum", ["field-id", 1]]] });
      // legacy
      expect(
        Query.addAggregation({ aggregation: [["count"]] }, [
          "sum",
          ["field-id", 1],
        ]),
      ).toEqual({ aggregation: [["count"], ["sum", ["field-id", 1]]] });
    });
  });
  describe("updateAggregation", () => {
    it("should update the correct aggregation", () => {
      expect(
        Query.updateAggregation(
          { aggregation: [["count"], ["sum", ["field-id", 1]]] },
          1,
          ["sum", ["field-id", 2]],
        ),
      ).toEqual({ aggregation: [["count"], ["sum", ["field-id", 2]]] });
    });
  });
  describe("removeAggregation", () => {
    it("should remove one of two aggregations", () => {
      expect(
        Query.removeAggregation(
          { aggregation: [["count"], ["sum", ["field-id", 1]]] },
          0,
        ),
      ).toEqual({ aggregation: [["sum", ["field-id", 1]]] });
    });
    it("should remove the last aggregations", () => {
      expect(Query.removeAggregation({ aggregation: [["count"]] }, 0)).toEqual(
        {},
      );
    });
    it("should remove the last aggregations for deprecated form", () => {
      expect(Query.removeAggregation({ aggregation: ["count"] }, 0)) // deprecated
        .toEqual({});
    });
  });
  describe("clearAggregations", () => {
    it("should remove all aggregations", () => {
      expect(Query.clearAggregations({ aggregation: [["count"]] })).toEqual({});
      expect(
        Query.clearAggregations({
          aggregation: [["count"], ["sum", ["field-id", 1]]],
        }),
      ).toEqual({});
    });
    it("should remove all aggregations for deprecated form", () => {
      expect(Query.clearAggregations({ aggregation: ["count"] })) // deprecated
        .toEqual({});
    });
  });

  describe("removeBreakout", () => {
    it("should remove sort as well", () => {
      expect(
        Query.removeBreakout(
          {
            breakout: [["field-id", 1]],
            "order-by": [["asc", ["field-id", 1]]],
          },
          0,
        ),
      ).toEqual({});
      expect(
        Query.removeBreakout(
          {
            breakout: [["field-id", 2], ["field-id", 1]],
            "order-by": [["asc", ["field-id", 1]]],
          },
          0,
        ),
      ).toEqual({
        breakout: [["field-id", 1]],
        "order-by": [["asc", ["field-id", 1]]],
      });
    });
    it("should not remove aggregation sorts", () => {
      expect(
        Query.removeBreakout(
          {
            aggregation: [["count"]],
            breakout: [["field-id", 2], ["field-id", 1]],
            "order-by": [["asc", ["aggregation", 0]]],
          },
          0,
        ),
      ).toEqual({
        aggregation: [["count"]],
        breakout: [["field-id", 1]],
        "order-by": [["asc", ["aggregation", 0]]],
      });
    });
  });
});
