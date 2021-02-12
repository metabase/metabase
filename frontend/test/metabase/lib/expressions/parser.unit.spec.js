import { parse } from "metabase/lib/expressions/parser";

describe("metabase/lib/expressions/parser", () => {
  function parseSource(source, startRule) {
    let result = null;
    try {
      result = parse({ source, tokenVector: null, startRule });
      if (result.typeErrors.length > 0) {
        throw new Error(result.typeErrors);
      }
    } catch (e) {
      let err = e;
      if (err.length && err.length > 0) {
        err = err[0];
        if (typeof err.message === "string") {
          err = err.message;
        }
      }
      throw err;
    }
    return result.cst;
  }

  function parseExpression(expr) {
    return parseSource(expr, "expression");
  }

  function parseAggregation(aggregation) {
    return parseSource(aggregation, "aggregation");
  }

  describe("in aggregation mode", () => {
    it("should handle a simple aggregation", () => {
      expect(() => parseAggregation("Sum([Price])")).not.toThrow();
    });
    it("should handle a conditional aggregation", () => {
      expect(() => parseAggregation("CountIf( [Discount] > 0 )")).not.toThrow();
    });
    it("should handle a complex conditional aggregation", () => {
      expect(() =>
        parseAggregation("CountIf( ( [Subtotal] + [Tax] ) > 100 )"),
      ).not.toThrow();
    });
  });

  describe("in expression mode", () => {
    it("should handle a conditional using CASE", () => {
      expect(() =>
        parseExpression("Case( [Discount] > 0, 'Sale', 'Normal' )"),
      ).not.toThrow();
    });
    it("should handle a complex conditional using CASE", () => {
      expect(() =>
        parseExpression("Case( [Price]-[Discount] > 50, 'Deal', 'Regular' )"),
      ).not.toThrow();
    });
    it("should reject CASE with only one argument", () => {
      expect(() => parseExpression("case([Deal])")).toThrow();
    });
    it("should accept CASE with two arguments", () => {
      expect(() => parseExpression("case([Deal],x)")).not.toThrow();
    });
    it("should accept CASE with three arguments", () => {
      expect(() => parseExpression("case([Deal],x,y)")).not.toThrow();
    });
  });
});
