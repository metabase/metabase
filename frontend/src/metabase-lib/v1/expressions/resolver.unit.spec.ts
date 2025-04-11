import type * as Lib from "metabase-lib";

import { resolve } from "./resolver";
import type { StartRule } from "./types";

describe("resolve", () => {
  function collect(
    expression:
      | Lib.ExpressionParts
      | Lib.ColumnMetadata
      | Lib.MetricMetadata
      | Lib.SegmentMetadata,
    startRule: StartRule = "expression",
  ) {
    const dimensions: string[] = [];
    const segments: string[] = [];
    const metrics: string[] = [];

    const expr = resolve({
      expression,
      type: startRule,

      fn: (kind: string, name: string) => {
        switch (kind) {
          case "dimension":
            dimensions.push(name);
            break;
          case "segment":
            segments.push(name);
            break;
          case "metric":
            metrics.push(name);
            break;
        }
        return {
          operator: kind,
          options: {},
          args: [name],
        } as any;
      },
    });

    return { dimensions, segments, metrics, expression: expr };
  }

  function op(
    operator: string,
    ...args: (Lib.ExpressionParts | Lib.ExpressionArg)[]
  ): Lib.ExpressionParts {
    return {
      // @ts-expect-error: TODO
      operator,
      options: {},
      args,
    };
  }

  // handy references
  const A = op("dimension", "A");
  const B = op("dimension", "B");
  const C = op("dimension", "C");
  const P = op("dimension", "P");
  const Q = op("dimension", "Q");
  const R = op("dimension", "R");
  const S = op("dimension", "S");
  const X = op("dimension", "X");
  const Y = op("dimension", "Y");

  const expr = (expr: Lib.ExpressionParts) => collect(expr, "expression");
  const filter = (expr: Lib.ExpressionParts) => collect(expr, "boolean");
  const aggregation = (expr: Lib.ExpressionParts) =>
    collect(expr, "aggregation");

  describe("for filters", () => {
    it("should resolve segments correctly", () => {
      expect(filter(A).segments).toEqual(["A"]);
      expect(filter(op("not", B)).segments).toEqual(["B"]);
      expect(filter(op("not", op("not", C))).segments).toEqual(["C"]);
      expect(filter(op(">", P, 3)).segments).toEqual([]);
      expect(filter(op("and", op("<", Q, 1), R)).segments).toEqual(["R"]);
      expect(filter(op("is-null", S)).segments).toEqual([]);
      expect(filter(op("not-empty", S)).segments).toEqual([]);
      expect(filter(op(">", op("lower", A), "X")).segments).toEqual([]);
      expect(filter(op("<", op("sqrt", B), 1)).segments).toEqual([]);
      expect(filter(op("contains", C, "SomeString")).segments).toEqual([]);
      expect(filter(op("or", P, op(">", Q, 3))).segments).toEqual(["P"]);
      expect(filter(op("not-null", C)).segments).toEqual([]);
      expect(filter(op("not-empty", C)).segments).toEqual([]);
    });

    it("should resolve dimensions correctly", () => {
      expect(filter(A).dimensions).toEqual([]);
      expect(filter(op("not", B)).dimensions).toEqual([]);
      expect(filter(op("not", op("not", C))).dimensions).toEqual([]);
      expect(filter(op(">", P, 3)).dimensions).toEqual(["P"]);
      expect(filter(op("and", op("<", Q, 1), R)).dimensions).toEqual(["Q"]);
      expect(filter(op("is-null", Q)).dimensions).toEqual(["Q"]);
      expect(filter(op("not-empty", S)).dimensions).toEqual(["S"]);
      expect(filter(op(">", op("lower", A), "X")).dimensions).toEqual(["A"]);
      expect(filter(op("<", op("sqrt", B), 1)).dimensions).toEqual(["B"]);
      expect(filter(op("contains", C, "SomeString")).dimensions).toEqual(["C"]);
      expect(filter(op("or", P, op(">", Q, 3))).dimensions).toEqual(["Q"]);
      expect(
        filter(op("does-not-contain", C, "somestring")).dimensions,
      ).toEqual(["C"]);
      expect(filter(op("not-null", C)).dimensions).toEqual(["C"]);
      expect(filter(op("not-empty", C)).dimensions).toEqual(["C"]);
    });

    it("should work on functions with optional flag", () => {
      expect(() =>
        filter(op("time-interval", A, 3, "day", "include-current")),
      ).not.toThrow();
    });
  });

  describe("for expressions (for custom columns)", () => {
    it("should resolve segments correctly", () => {
      expect(expr(op("trim", A)).segments).toEqual([]);
      expect(expr(op("round", B)).segments).toEqual([]);
      expect(expr(op("concat", S)).segments).toEqual([]);
      expect(expr(op("concat", A, B)).segments).toEqual([]);
      expect(expr(op("coalesce", P)).segments).toEqual([]);
      expect(expr(op("coalesce", P, Q, R)).segments).toEqual([]);
      expect(expr(op("not-null", A)).segments).toEqual([]);
      expect(expr(op("not-empty", A)).segments).toEqual([]);
    });

    it("should resolve dimensions correctly", () => {
      expect(expr(op("trim", A)).dimensions).toEqual(["A"]);
      expect(expr(op("round", B)).dimensions).toEqual(["B"]);
      expect(expr(op("concat", S)).dimensions).toEqual(["S"]);
      expect(expr(op("concat", A, B)).dimensions).toEqual(["A", "B"]);
      expect(expr(op("coalesce", P)).dimensions).toEqual(["P"]);
      expect(expr(op("coalesce", P, Q, R)).dimensions).toEqual(["P", "Q", "R"]);
      expect(expr(op("in", A, B, C)).dimensions).toEqual(["A", "B", "C"]);
      expect(expr(op("text", A)).dimensions).toEqual(["A"]);
      expect(expr(op("integer", A)).dimensions).toEqual(["A"]);
      expect(expr(op("does-not-contain", A, "SomeString")).dimensions).toEqual([
        "A",
      ]);
      expect(expr(op("not-null", A)).dimensions).toEqual(["A"]);
      expect(expr(op("not-empty", A)).dimensions).toEqual(["A"]);
    });

    it("should allow nested datetime expressions", () => {
      expect(() => expr(op("get-year", op("now")))).not.toThrow();
    });

    describe("datetime functions", () => {
      it("should resolve unchained functions", () => {
        expect(() => expr(op("get-week", "2022-01-01"))).not.toThrow();
        expect(() =>
          expr(op("datetime-add", "2022-01-01", 1, "month")),
        ).not.toThrow();

        // TODO: Implementation should be fine-tuned so that these throw
        // as they are not really datetime
        expect(() => expr(op("get-day", A))).not.toThrow();
        expect(() => expr(op("get-day", "a"))).not.toThrow();
        expect(() => expr(op("get-day-of-week", A))).not.toThrow();
        expect(() => expr(op("get-day-of-week", "a"))).not.toThrow();
        expect(() => expr(op("get-week", A))).not.toThrow();
        expect(() => expr(op("get-week", "a"))).not.toThrow();
        expect(() => expr(op("get-month", A))).not.toThrow();
        expect(() => expr(op("get-month", "a"))).not.toThrow();
        expect(() => expr(op("get-quarter", A))).not.toThrow();
        expect(() => expr(op("get-quarter", "a"))).not.toThrow();
        expect(() => expr(op("get-year", A))).not.toThrow();
        expect(() => expr(op("get-year", "a"))).not.toThrow();
      });

      it("should resolve chained commmands", () => {
        expect(() =>
          expr(
            op(
              "datetime-subtract",
              op("datetime-add", "2022-01-01", 1, "month"),
              2,
              "minute",
            ),
          ),
        ).not.toThrow();
      });

      it("should chain datetime functions onto functions of compatible types", () => {
        expect(() =>
          expr(
            op(
              "concat",
              op("datetime-add", "2022-01-01", 1, "month"),
              "a string",
            ),
          ),
        ).not.toThrow();
      });
    });
  });

  describe("for aggregations", () => {
    it("should resolve dimensions correctly", () => {
      expect(aggregation(A).dimensions).toEqual([]);
      expect(aggregation(op("cum-sum", B)).dimensions).toEqual(["B"]);
      expect(aggregation(op("-", 5, op("avg", C))).dimensions).toEqual(["C"]);
      expect(aggregation(op("share", op(">", P, 3))).dimensions).toEqual(["P"]);
      expect(aggregation(op("max", op("*", 4, Q))).dimensions).toEqual(["Q"]);
      expect(aggregation(op("+", R, op("median", S))).dimensions).toEqual([
        "S",
      ]);
      expect(
        aggregation(op("count-where", op("not-null", A))).dimensions,
      ).toEqual(["A"]);
      expect(
        aggregation(op("count-where", op("not-empty", A))).dimensions,
      ).toEqual(["A"]);
    });

    it("should resolve metrics correctly", () => {
      expect(aggregation(A).metrics).toEqual(["A"]);
      expect(aggregation(op("cum-sum", B)).metrics).toEqual([]);
      expect(aggregation(op("-", 5, op("avg", C))).metrics).toEqual([]);
      expect(aggregation(op("share", op(">", P, 3))).metrics).toEqual([]);
      expect(aggregation(op("max", op("*", 4, Q))).metrics).toEqual([]);
      expect(aggregation(op("+", R, op("median", S))).metrics).toEqual(["R"]);
    });

    it("should accept PERCENTILE with two arguments", () => {
      // PERCENTILE(A, 0.5)
      expect(() => aggregation(op("percentile", A, 0.5))).not.toThrow();
    });

    it("should handle Distinct/Min/Max aggregating over non-numbers", () => {
      // DISTINCT(COALESCE("F")) also for MIN and MAX
      expect(() =>
        aggregation(op("distinct", op("coalesce", "F"))),
      ).not.toThrow();
      expect(() => aggregation(op("min", op("coalesce", "F")))).not.toThrow();
      expect(() => aggregation(op("max", op("coalesce", "F")))).not.toThrow();
    });
  });

  describe("for CASE expressions", () => {
    it("should handle CASE with two arguments", () => {
      // CASE(A,B)
      expect(expr(op("case", A, B))).toEqual({
        dimensions: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with three arguments", () => {
      // CASE(P, Q, R)
      expect(expr(op("case", P, Q, R))).toEqual({
        dimensions: ["Q", "R"],
        segments: ["P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with four arguments", () => {
      // CASE(A, B, P, Q)
      expect(expr(op("case", A, B, P, Q))).toEqual({
        dimensions: ["B", "Q"],
        segments: ["A", "P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with five arguments", () => {
      // CASE(A, B, P, Q, R)
      expect(expr(op("case", A, B, P, Q, R))).toEqual({
        dimensions: ["B", "Q", "R"],
        segments: ["A", "P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with two complex arguments", () => {
      // CASE(P < 2, Q)
      expect(expr(op("case", op("<", P, 2), Q))).toEqual({
        dimensions: ["P", "Q"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle nested CASE", () => {
      // CASE(P, Q, CASE(A, B))
      expect(expr(op("case", P, Q, op("case", A, B)))).toEqual({
        dimensions: ["Q", "B"],
        segments: ["P", "A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE inside COALESCE", () => {
      // COALESCE(CASE(A, B))
      expect(expr(op("coalesce", op("case", A, B)))).toEqual({
        dimensions: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should accept a CASE expression with complex arguments", () => {
      // CASE(X, 0.5*Y, A-B)
      expect(() =>
        expr(op("case", X, op("*", 0.5, Y), op("-", A, B))),
      ).not.toThrow();
    });

    it("should allow sum inside expression in aggregation", () => {
      // CASE(SUM(A) > 10, B)
      expect(() =>
        expr(op("case", op(">", op("sum", A), 10), B)),
      ).not.toThrow();
    });

    it("should accept IF as an alias for CASE", () => {
      expect(expr(op("if", A, B))).toEqual({
        dimensions: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should not fail on literal 0", () => {
      expect(expr(op("case", A, 0)).expression).toEqual({
        operator: "case",
        options: {},
        args: [expect.any(Object), 0],
      });

      expect(expr(op("case", A, 0, 0)).expression).toEqual({
        operator: "case",
        options: {},
        args: [expect.any(Object), 0, 0],
      });
    });
  });

  it("should reject unknown function", () => {
    expect(() => expr(op("foobar", 42))).toThrow();
  });

  describe("coalesce", () => {
    it("should resolve coalesce correctly", () => {
      expect(expr(op("coalesce", A))).toEqual({
        dimensions: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
      expect(filter(op("coalesce", A))).toEqual({
        dimensions: [],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
      expect(aggregation(op("coalesce", A))).toEqual({
        dimensions: [],
        segments: [],
        metrics: ["A"],
        expression: expect.any(Object),
      });
      expect(aggregation(op("trim", op("coalesce", A)))).toEqual({
        dimensions: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should accept COALESCE for number", () => {
      expect(() => expr(op("round", op("coalesce", 0)))).not.toThrow();
    });

    it("should accept COALESCE for string", () => {
      expect(() => expr(op("trim", op("coalesce", "B")))).not.toThrow();
    });

    it("should honor CONCAT's implicit casting", () => {
      expect(() => expr(op("concat", op("coalesce", "B", 1)))).not.toThrow();
    });
  });

  describe("comparison operators", () => {
    const operators = ["<", "<=", ">", ">="] as const;
    operators.forEach((operator) => {
      it(`should resolve both args to ${operator}`, () => {
        expect(expr(op(operator, A, B)).dimensions).toEqual(["A", "B"]);
        expect(filter(op(operator, A, B)).dimensions).toEqual(["A", "B"]);
        expect(aggregation(op(operator, A, B)).dimensions).toEqual(["A", "B"]);
        expect(
          aggregation(op("count-where", op(operator, A, B))).dimensions,
        ).toEqual(["A", "B"]);
      });
    });
  });

  describe("number operators", () => {
    const operators = ["+", "-", "*", "/"] as const;
    operators.forEach((operator) => {
      it(`should resolve all ${operator} args correctly`, () => {
        expect(expr(op(operator, A, B, C))).toEqual({
          dimensions: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Object),
        });
        expect(filter(op(operator, A, B, C))).toEqual({
          dimensions: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Object),
        });
        expect(aggregation(op(operator, A, B, C))).toEqual({
          dimensions: [],
          segments: [],
          metrics: ["A", "B", "C"],
          expression: expect.any(Object),
        });
      });
    });
  });

  describe("logic operators", () => {
    const operators = ["and", "or"] as const;
    operators.forEach((operator) => {
      it(`should resolve all args to ${operator} correctly`, () => {
        expect(expr(op(operator, A, B, C))).toEqual({
          dimensions: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
        expect(filter(op(operator, A, B, C))).toEqual({
          dimensions: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
        expect(aggregation(op(operator, A, B, C))).toEqual({
          dimensions: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
      });
    });

    it("should resolve not args correctly", () => {
      expect(expr(op("not", A))).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
      expect(filter(op("not", A))).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
      expect(aggregation(op("not", A))).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
    });
  });
});
