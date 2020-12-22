import { parse } from "metabase/lib/expressions/parser";

describe("metabase/lib/expressions/parser", () => {
  describe("in aggregation mode", () => {
    function parseAggregation(source) {
      const tokenVector = null;
      const startRule = "aggregation";
      return parse({ source, tokenVector, startRule });
    }
    it("should handle a simple aggregation", () => {
      expect(() => parseAggregation("Sum([Price])")).not.toThrow();
    });
    it("should handle a conditional aggregation", () => {
      expect(() => parseAggregation("CountIf( [Discount] > 0 )")).not.toThrow();
    });
    it.skip("should handle a complex conditional aggregation", () => {
      expect(() =>
        parseAggregation("CountIf( ( [Subtotal] + [Tax] ) > 100 )"),
      ).not.toThrow();
    });
  });

  describe("in expression mode", () => {
    function parseExpression(source) {
      const tokenVector = null;
      const startRule = "expression";
      return parse({ source, tokenVector, startRule });
    }
    it("should handle a conditional using CASE", () => {
      expect(() =>
        parseExpression("Case( [Discount] > 0, 'Sale', 'Normal' )"),
      ).not.toThrow();
    });
    it.skip("should handle a complex conditional using CASE", () => {
      expect(() =>
        parseExpression("Case( [Price]-[Discount] > 50, 'Deal', 'Regular' )"),
      ).not.toThrow();
    });
  });
});
