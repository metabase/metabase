import { parse } from "metabase/lib/expressions/parser";
import { ExpressionVisitor } from "metabase/lib/expressions/visitor";
import { parseIdentifierString } from "metabase/lib/expressions/index";

// Since the type checking is inserted as the last stage in the expression parser,
// the whole tests must continue to pass (i.e. none of them should thrown
// an exception) to assert that type checker works correctly.

describe("type-checker", () => {
  function parseSource(source, startRule) {
    let cst = null;
    try {
      cst = parse({ source, tokenVector: null, startRule }).cst;
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
    return cst;
  }

  function collect(source, startRule) {
    class Collector extends ExpressionVisitor {
      constructor() {
        super();
        this.metrics = [];
        this.segments = [];
        this.dimensions = [];
      }
      identifier(ctx) {
        return ctx.Identifier[0].image;
      }
      identifierString(ctx) {
        return parseIdentifierString(ctx.IdentifierString[0].image);
      }
      dimensionExpression(ctx) {
        const name = this.visit(ctx.dimensionName);
        if (ctx.resolveAs === "metric") {
          this.metrics.push(name);
        } else if (ctx.resolveAs === "segment") {
          this.segments.push(name);
        } else {
          this.dimensions.push(name);
        }
      }
    }
    const tree = parseSource(source, startRule);
    const collector = new Collector();
    collector.visit(tree);
    return collector;
  }

  describe("for an expression", () => {
    function expr(source) {
      return collect(source, "expression");
    }
    it("should resolve dimensions correctly", () => {
      expect(expr("[Price]+[Tax]").dimensions).toEqual(["Price", "Tax"]);
      expect(expr("ABS([Discount])").dimensions).toEqual(["Discount"]);
      expect(expr("CASE([Deal],10,20)").dimensions).toEqual([]);
    });

    it("should resolve segments correctly", () => {
      expect(expr("[Price]+[Tax]").segments).toEqual([]);
      expect(expr("ABS([Discount])").segments).toEqual([]);
      expect(expr("CASE([Deal],10,20)").segments).toEqual(["Deal"]);
    });

    it("should resolve dimensions and segments correctly", () => {
      expect(expr("[X]+CASE([Y],4,5)").dimensions).toEqual(["X"]);
      expect(expr("[X]+CASE([Y],4,5)").segments).toEqual(["Y"]);
    });
  });

  describe("for a filter", () => {
    function filter(source) {
      return collect(source, "boolean");
    }
    it("should resolve segments correctly", () => {
      expect(filter("[Clearance]").segments).toEqual(["Clearance"]);
      expect(filter("NOT [Deal]").segments).toEqual(["Deal"]);
      expect(filter("NOT NOT [Deal]").segments).toEqual(["Deal"]);
      expect(filter("P > 3").segments).toEqual([]);
      expect(filter("R<1 AND [S]>4").segments).toEqual([]);
      expect(filter("5 <= Q").segments).toEqual([]);
      expect(filter("Between([BIG],3,7)").segments).toEqual([]);
      expect(filter("Contains([GI],'Joe')").segments).toEqual([]);
    });

    it("should resolve dimensions correctly", () => {
      expect(filter("[Clearance]").dimensions).toEqual([]);
      expect(filter("NOT [Deal]").dimensions).toEqual([]);
      expect(filter("NOT NOT [Deal]").dimensions).toEqual([]);
      expect(filter("P > 3").dimensions).toEqual(["P"]);
      expect(filter("R<1 AND [S]>4").dimensions).toEqual(["R", "S"]);
      expect(filter("5 <= Q").dimensions).toEqual(["Q"]);
      expect(filter("Between([BIG],3,7)").dimensions).toEqual(["BIG"]);
      expect(filter("Contains([GI],'Joe')").dimensions).toEqual(["GI"]);
    });

    it("should resolve dimensions and segments correctly", () => {
      expect(filter("[A] OR [B]>0").segments).toEqual(["A"]);
      expect(filter("[A] OR [B]>0").dimensions).toEqual(["B"]);
      expect(filter("[X]=4 AND NOT [Y]").segments).toEqual(["Y"]);
      expect(filter("[X]=4 AND NOT [Y]").dimensions).toEqual(["X"]);
      expect(filter("T OR Between([R],0,9)").segments).toEqual(["T"]);
      expect(filter("T OR Between([R],0,9)").dimensions).toEqual(["R"]);
    });
  });

  describe("for an aggregation", () => {
    function aggregation(source) {
      return collect(source, "aggregation");
    }
    it("should resolve dimensions correctly", () => {
      expect(aggregation("Sum([Discount])").dimensions).toEqual(["Discount"]);
      expect(aggregation("5-Average([Rating])").dimensions).toEqual(["Rating"]);
      expect(aggregation("Share(contains([P],'Q'))").dimensions).toEqual(["P"]);
      expect(aggregation("CountIf([Tax]>13)").dimensions).toEqual(["Tax"]);
      expect(aggregation("Sum([Total]*2)").dimensions).toEqual(["Total"]);
      expect(aggregation("[Total]").dimensions).toEqual([]);
      expect(aggregation("CountIf(4>[A]+[B])").dimensions).toEqual(["A", "B"]);
    });

    it("should resolve metrics correctly", () => {
      expect(aggregation("Sum([Discount])").metrics).toEqual([]);
      expect(aggregation("5-Average([Rating])").metrics).toEqual([]);
      expect(aggregation("Share(contains([P],'Q'))").metrics).toEqual([]);
      expect(aggregation("CountIf([Tax]>13)").metrics).toEqual([]);
      expect(aggregation("Sum([Total]*2)").metrics).toEqual([]);
      expect(aggregation("[Total]").metrics).toEqual(["Total"]);
      expect(aggregation("CountIf(4>[A]+[B])").metrics).toEqual([]);
    });

    it("should resolve dimensions and metrics correctly", () => {
      expect(aggregation("[X]+Sum([Y])").dimensions).toEqual(["Y"]);
      expect(aggregation("[X]+Sum([Y])").metrics).toEqual(["X"]);
    });
  });
});
