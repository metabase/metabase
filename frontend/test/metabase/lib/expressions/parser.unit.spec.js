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

  function parseFilter(filter) {
    return parseSource(filter, "boolean");
  }

  describe("(in expression mode)", () => {
    it("should accept a number", () => {
      expect(() => parseExpression("42")).not.toThrow();
    });
    it("should accept a single-quoted string", () => {
      expect(() => parseExpression("'Answer'")).not.toThrow();
    });
    it("should accept a double-quoted string", () => {
      expect(() => parseExpression('"Answer"')).not.toThrow();
    });
    it("should accept a group expression (in parentheses)", () => {
      expect(() => parseExpression("(42)")).not.toThrow();
    });
    it("should accept the function lower", () => {
      expect(() => parseExpression("Lower([Title])")).not.toThrow();
    });
    it("should accept the function upper", () => {
      expect(() => parseExpression("Upper([Title])")).not.toThrow();
    });

    it("should accept the function CASE", () => {
      expect(() => parseExpression("Case([Z]>7, 'X', 'Y')")).not.toThrow();
    });
    it("should accept the function CASE with multiple cases", () => {
      expect(() => parseExpression("Case([X]>5,5,[X]>3,3,0)")).not.toThrow();
    });

    it("should reject an unclosed single-quoted string", () => {
      expect(() => parseExpression('"Answer')).toThrow();
    });
    it("should reject an unclosed double-quoted string", () => {
      expect(() => parseExpression('"Answer')).toThrow();
    });
    it("should reject a mismatched quoted string", () => {
      expect(() => parseExpression("\"Answer'")).toThrow();
    });
    it("should handle a conditional with ISEMPTY", () => {
      expect(() =>
        parseExpression("case(isempty([Discount]),[P])"),
      ).not.toThrow();
    });
    it("should reject CASE with only one argument", () => {
      expect(() => parseExpression("case([Deal])")).toThrow();
    });
    it("should accept CASE with two arguments", () => {
      expect(() => parseExpression("case([Deal],x)")).not.toThrow();
    });
  });

  describe("(in aggregation mode)", () => {
    it("should accept an aggregration with COUNT", () => {
      expect(() => parseAggregation("Count()")).not.toThrow();
    });
    it("should accept an aggregration with SUM", () => {
      expect(() => parseAggregation("Sum([Price])")).not.toThrow();
    });
    it("should accept an aggregration with DISTINCT", () => {
      expect(() => parseAggregation("Distinct([Supplier])")).not.toThrow();
    });
    it("should accept an aggregration with STANDARDDEVIATION", () => {
      expect(() => parseAggregation("StandardDeviation([Debt])")).not.toThrow();
    });
    it("should accept an aggregration with AVERAGE", () => {
      expect(() => parseAggregation("Average([Height])")).not.toThrow();
    });
    it("should accept an aggregration with MAX", () => {
      expect(() => parseAggregation("Max([Discount])")).not.toThrow();
    });
    it("should accept an aggregration with MIN", () => {
      expect(() => parseAggregation("Min([Rating])")).not.toThrow();
    });
    it("should accept an aggregration with MEDIAN", () => {
      expect(() => parseAggregation("Median([Total])")).not.toThrow();
    });
    it("should accept an aggregration with VAR", () => {
      expect(() => parseAggregation("Variance([Tax])")).not.toThrow();
    });

    it("should accept a conditional aggregration with COUNTIF", () => {
      expect(() => parseAggregation("CountIf([Discount] > 0)")).not.toThrow();
    });

    it("should accept a conditional aggregration with COUNTIF containing an expression", () => {
      expect(() => parseAggregation("CountIf(([A]+[B]) > 1)")).not.toThrow();
      expect(() =>
        parseAggregation("CountIf( 1.2 * [Price] > 37)"),
      ).not.toThrow();
    });
  });

  describe("(in filter mode)", () => {
    it("should accept a simple comparison", () => {
      expect(() => parseFilter("[Total] > 12")).not.toThrow();
    });
    it("should accept another simple comparison", () => {
      expect(() => parseFilter("10 < [DiscountPercent]")).not.toThrow();
    });
    it("should accept a logical NOT", () => {
      expect(() => parseFilter("NOT [Debt] > 5")).not.toThrow();
    });
    it("should accept a segment", () => {
      expect(() => parseFilter("[SpecialDeal]")).not.toThrow();
    });
    it("should accept a logical NOT on segment", () => {
      expect(() => parseFilter("NOT [Clearance]")).not.toThrow();
    });
    it("should accept multiple logical NOTs on segment", () => {
      expect(() => parseFilter("NOT NOT [Clearance]")).not.toThrow();
    });
    it("should accept a relational between a segment and a dimension", () => {
      expect(() => parseFilter("([Shipping] < 2) AND [Sale]")).not.toThrow();
    });
    it("should accept parenthesized logical operations", () => {
      expect(() => parseFilter("([Deal] AND [HighRating])")).not.toThrow();
      expect(() => parseFilter("([Price] < 100 OR [Refurb])")).not.toThrow();
    });
    it("should accept a function", () => {
      expect(() => parseFilter("between([Subtotal], 1, 2)")).not.toThrow();
    });
    it("should reject CASE with only one argument", () => {
      expect(() => parseFilter("case([Deal])")).toThrow();
    });
  });
});
