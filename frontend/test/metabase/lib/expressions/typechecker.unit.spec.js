import { parse } from "metabase/lib/expressions/parser";
import { compile } from "metabase/lib/expressions/compile";

// Since the type checking is inserted as the last stage in the expression parser,
// the whole tests must continue to pass (i.e. none of them should thrown
// an exception) to assert that type checker works correctly.

describe("type-checker", () => {
  function parseSource(source, startRule) {
    const mockResolve = (kind, name) => [kind, name];
    const { cst } = parse({ source, tokenVector: null, startRule });
    compile({ source, startRule, cst, resolve: mockResolve });
    return { cst };
  }

  describe("for an expression", () => {
    const validate = e => parseSource(e, "expression");

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
  });

  describe("for an aggregation", () => {
    const validate = e => parseSource(e, "aggregation");

    it("should accept PERCENTILE with two arguments", () => {
      expect(() => validate("PERCENTILE([Rating], .5)")).not.toThrow();
    });
  });

  describe("for a filter", () => {
    const validate = e => parseSource(e, "boolean");

    it("should reject a number literal", () => {
      expect(() => validate("3.14159")).toThrow();
    });
    it("should reject a string literal", () => {
      expect(() => validate('"TheAnswer"')).toThrow();
    });

    it("should catch mismatched number of function parameters", () => {
      expect(() => validate("CONTAINS()")).toThrow();
      expect(() => validate("CONTAINS([Name])")).toThrow();
      expect(() => validate("CONTAINS([Type],'A','B','C')")).toThrow();
      expect(() => validate("StartsWith()")).toThrow();
      expect(() => validate("StartsWith([Name])")).toThrow();
      expect(() => validate("StartsWith([Type],'P','Q','R')")).toThrow();
      expect(() => validate("EndsWith()")).toThrow();
      expect(() => validate("EndsWith([Name])")).toThrow();
      expect(() => validate("EndsWith([Type],'X','Y','Z')")).toThrow();
    });

    it("should allow a comparison (lexicographically) on strings", () => {
      expect(() => validate("A <= 'B'")).not.toThrow();
    });

    it("should allow a comparison (lexicographically) on functions returning string", () => {
      expect(() => validate("Lower([State]) > 'AB'")).not.toThrow();
    });

    it("should reject a less/greater comparison on functions returning boolean", () => {
      expect(() => validate("IsEmpty([Tax]) < 5")).toThrow();
      expect(() => validate("IsEmpty([Tax]) >= 0")).toThrow();
    });
  });
});
