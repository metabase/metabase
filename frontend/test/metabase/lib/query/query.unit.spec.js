import * as Query from "metabase-lib/v1/queries/utils/query";

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
          aggregation: [["count"], ["sum", ["field", 1, null]]],
        }),
      ).toEqual([["count"], ["sum", ["field", 1, null]]]);
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
          ["field", 1, null],
        ]),
      ).toEqual({ aggregation: [["count"], ["sum", ["field", 1, null]]] });
      // legacy
      expect(
        Query.addAggregation({ aggregation: [["count"]] }, [
          "sum",
          ["field", 1, null],
        ]),
      ).toEqual({ aggregation: [["count"], ["sum", ["field", 1, null]]] });
    });
  });
  describe("updateAggregation", () => {
    it("should update the correct aggregation", () => {
      expect(
        Query.updateAggregation(
          { aggregation: [["count"], ["sum", ["field", 1, null]]] },
          1,
          ["sum", ["field", 2, null]],
        ),
      ).toEqual({ aggregation: [["count"], ["sum", ["field", 2, null]]] });
    });
  });
  describe("removeAggregation", () => {
    it("should remove one of two aggregations", () => {
      expect(
        Query.removeAggregation(
          { aggregation: [["count"], ["sum", ["field", 1, null]]] },
          0,
        ),
      ).toEqual({ aggregation: [["sum", ["field", 1, null]]] });
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
});
