import { parse } from "metabase/lib/expressions/parser";
import { ExpressionVisitor } from "metabase/lib/expressions/visitor";
import { parseIdentifierString } from "metabase/lib/expressions/index";
import { compactSyntaxTree } from "metabase/lib/expressions/typechecker";

// Since the type checking is inserted as the last stage in the expression parser,
// the whole tests must continue to pass (i.e. none of them should thrown
// an exception) to assert that type checker works correctly.

describe("type-checker", () => {
  function parseSource(source, startRule) {
    let cst = null;
    let typeErrors = [];
    try {
      const result = parse({ source, tokenVector: null, startRule });
      cst = result.cst;
      typeErrors = result.typeErrors;
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
    return { cst, typeErrors };
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
      identifierExpression(ctx) {
        const name = this.visit(ctx.identifierName);
        if (ctx.resolveAs === "metric") {
          this.metrics.push(name);
        } else if (ctx.resolveAs === "segment") {
          this.segments.push(name);
        } else {
          this.dimensions.push(name);
        }
      }
    }
    const { cst } = parseSource(source, startRule);
    const collector = new Collector();
    collector.visit(cst);
    return collector;
  }

  describe("for an expression", () => {
    function expr(source) {
      return collect(source, "expression");
    }
    function validate(source) {
      const { typeErrors } = parseSource(source, "expression");
      if (typeErrors.length > 0) {
        throw new Error(typeErrors[0].message);
      }
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
      expect(expr("CASE([Z]>100,'Pricey')").dimensions).toEqual(["Z"]);
      expect(expr("CASE([Z]>100,'Pricey')").segments).toEqual([]);
      expect(expr("CASE(A,B,C)").dimensions).toEqual(["B", "C"]);
      expect(expr("CASE(A,B,C)").segments).toEqual(["A"]);
      expect(expr("CASE(P,Q,R,S)").dimensions).toEqual(["Q", "S"]);
      expect(expr("CASE(P,Q,R,S)").segments).toEqual(["P", "R"]);
    });

    it("should allow any number of arguments in a variadic function", () => {
      expect(() => validate("CONCAT('1')")).not.toThrow();
      expect(() => validate("CONCAT('1','2')")).not.toThrow();
      expect(() => validate("CONCAT('1','2','3')")).not.toThrow();
    });

    it("should reject a CASE expression with only one argument", () => {
      expect(() => validate("CASE([Deal])")).toThrow();
    });

    it("should reject a CASE expression with incorrect argument type", () => {
      expect(() => validate("CASE(X, 1, 2, 3)")).toThrow();
    });

    it("should accept a CASE expression with complex arguments", () => {
      expect(() => validate("CASE(Deal, 0.5*X, Y-Z)")).not.toThrow();
    });

    it("should accept PERCENTILE with two arguments", () => {
      expect(() => validate("PERCENTILE([Rating], .5)")).not.toThrow();
    });
  });

  describe("for a filter", () => {
    function filter(source) {
      return collect(source, "boolean");
    }
    function validate(source) {
      const { typeErrors } = parseSource(source, "boolean");
      if (typeErrors.length > 0) {
        throw new Error(typeErrors[0].message);
      }
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
      expect(filter("IsEmpty([Discount])").segments).toEqual([]);
      expect(filter("IsNull([Tax])").segments).toEqual([]);
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
      expect(filter("IsEmpty([Discount])").dimensions).toEqual(["Discount"]);
      expect(filter("IsNull([Tax])").dimensions).toEqual(["Tax"]);
    });

    it("should resolve dimensions and segments correctly", () => {
      expect(filter("[A] OR [B]>0").segments).toEqual(["A"]);
      expect(filter("[A] OR [B]>0").dimensions).toEqual(["B"]);
      expect(filter("[X]=4 AND NOT [Y]").segments).toEqual(["Y"]);
      expect(filter("[X]=4 AND NOT [Y]").dimensions).toEqual(["X"]);
      expect(filter("T OR Between([R],0,9)").segments).toEqual(["T"]);
      expect(filter("T OR Between([R],0,9)").dimensions).toEqual(["R"]);
      expect(filter("NOT between(P, 3, 14) OR Q").dimensions).toEqual(["P"]);
      expect(filter("NOT between(P, 3, 14) OR Q").segments).toEqual(["Q"]);
    });

    it("should reject a number literal", () => {
      expect(() => validate("3.14159")).toThrow();
    });
    it("should reject a string literal", () => {
      expect(() => validate('"TheAnswer"')).toThrow();
    });

    it("should catch mismatched number of function parameters", () => {
      expect(() => validate("CONTAINS()")).toThrow();
      expect(() => validate("CONTAINS([Name])")).toThrow();
      expect(() => validate("CONTAINS([Type],'X','Y')")).toThrow();
      expect(() => validate("CONTAINS([Type],'P','Q','R')")).toThrow();
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

  describe("compactSyntaxTree", () => {
    function exprRoot(source) {
      const tokenVector = null;
      const startRule = "expression";
      const { cst } = parse({ source, tokenVector, startRule });
      const compactCst = compactSyntaxTree(cst);
      const { name } = compactCst;
      return name;
    }
    function filterRoot(source) {
      const tokenVector = null;
      const startRule = "boolean";
      const { cst } = parse({ source, tokenVector, startRule });
      const compactCst = compactSyntaxTree(cst);
      const { name } = compactCst;
      return name;
    }

    it("should handle literals", () => {
      expect(exprRoot("42")).toEqual("numberLiteral");
      expect(exprRoot("(43)")).toEqual("numberLiteral");
      expect(exprRoot("'Answer'")).toEqual("stringLiteral");
      expect(exprRoot('"Answer"')).toEqual("stringLiteral");
      expect(exprRoot('("The Answer")')).toEqual("stringLiteral");
    });
    it("should handle binary expressions", () => {
      expect(exprRoot("1+2")).toEqual("additionExpression");
      expect(exprRoot("3-4")).toEqual("additionExpression");
      expect(exprRoot("1+2-3")).toEqual("additionExpression");
      expect(exprRoot("(1+2-3)")).toEqual("additionExpression");
      expect(exprRoot("(1+2)-3")).toEqual("additionExpression");
      expect(exprRoot("1+(2-3)")).toEqual("additionExpression");
      expect(exprRoot("5*6")).toEqual("multiplicationExpression");
      expect(exprRoot("7/8")).toEqual("multiplicationExpression");
      expect(exprRoot("5*6/7")).toEqual("multiplicationExpression");
      expect(exprRoot("(5*6/7)")).toEqual("multiplicationExpression");
      expect(exprRoot("5*(6/7)")).toEqual("multiplicationExpression");
      expect(exprRoot("(5*6)/7")).toEqual("multiplicationExpression");
    });
    it("should handle function expressions", () => {
      expect(exprRoot("LOWER(A)")).toEqual("functionExpression");
      expect(exprRoot("UPPER(B)")).toEqual("functionExpression");
      expect(filterRoot("BETWEEN(C,0,9)")).toEqual("functionExpression");
    });
    it("should handle case expressions", () => {
      expect(exprRoot("CASE(X,1)")).toEqual("caseExpression");
      expect(exprRoot("CASE(Y,2,3)")).toEqual("caseExpression");
    });
    it("should handle relational expressions", () => {
      expect(filterRoot("1<2")).toEqual("relationalExpression");
      expect(filterRoot("3>4")).toEqual("relationalExpression");
      expect(filterRoot("5=6")).toEqual("relationalExpression");
      expect(filterRoot("7!=8")).toEqual("relationalExpression");
    });
    it("should handle logical expressions", () => {
      expect(filterRoot("A AND B")).toEqual("logicalAndExpression");
      expect(filterRoot("C OR D")).toEqual("logicalOrExpression");
      expect(filterRoot("A AND B OR C")).toEqual("logicalOrExpression");
      expect(filterRoot("NOT E")).toEqual("logicalNotExpression");
      expect(filterRoot("NOT NOT F")).toEqual("logicalNotExpression");
    });
  });
});
