import type { CaseOptions, Expression } from "metabase-types/api";

import { resolve } from "./resolver";
import type { StartRule } from "./types";

describe("resolve", () => {
  function collect(
    expression: Expression,
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
        return [kind, name];
      },
    });

    return { dimensions, segments, metrics, expression: expr };
  }

  // handy references
  const A: Expression = ["dimension", "A"];
  const B: Expression = ["dimension", "B"];
  const C: Expression = ["dimension", "C"];
  const P: Expression = ["dimension", "P"];
  const Q: Expression = ["dimension", "Q"];
  const R: Expression = ["dimension", "R"];
  const S: Expression = ["dimension", "S"];
  const X: Expression = ["segment", "X"];
  const Y: Expression = ["dimension", "Y"];

  const expr = (expr: Expression) => collect(expr, "expression");
  const filter = (expr: Expression) => collect(expr, "boolean");
  const aggregation = (expr: Expression) => collect(expr, "aggregation");

  describe("for filters", () => {
    it("should resolve segments correctly", () => {
      expect(filter(A).segments).toEqual(["A"]);
      expect(filter(["not", B]).segments).toEqual(["B"]);
      expect(filter(["not", ["not", C]]).segments).toEqual(["C"]);
      expect(filter([">", P, 3]).segments).toEqual([]);
      expect(filter(["and", ["<", Q, 1], R]).segments).toEqual(["R"]);
      expect(filter(["is-null", S]).segments).toEqual([]);
      expect(filter(["not-empty", S]).segments).toEqual([]);
      expect(filter([">", ["lower", A], "X"]).segments).toEqual([]);
      expect(filter(["<", ["sqrt", B], 1]).segments).toEqual([]);
      expect(filter(["contains", C, "SomeString"]).segments).toEqual([]);
      expect(filter(["or", P, [">", Q, 3]]).segments).toEqual(["P"]);
    });

    it("should resolve dimensions correctly", () => {
      expect(filter(A).dimensions).toEqual([]);
      expect(filter(["not", B]).dimensions).toEqual([]);
      expect(filter(["not", ["not", C]]).dimensions).toEqual([]);
      expect(filter([">", P, 3]).dimensions).toEqual(["P"]);
      expect(filter(["and", ["<", Q, 1], R]).dimensions).toEqual(["Q"]);
      expect(filter(["is-null", Q]).dimensions).toEqual(["Q"]);
      expect(filter(["not-empty", S]).dimensions).toEqual(["S"]);
      expect(filter([">", ["lower", A], "X"]).dimensions).toEqual(["A"]);
      expect(filter(["<", ["sqrt", B], 1]).dimensions).toEqual(["B"]);
      expect(filter(["contains", C, "SomeString"]).dimensions).toEqual(["C"]);
      expect(filter(["or", P, [">", Q, 3]]).dimensions).toEqual(["Q"]);
    });

    it("should work on functions with optional flag", () => {
      const flag = { "include-current": true };
      expect(() => filter(["time-interval", A, 3, "day", flag])).not.toThrow();
    });
  });

  describe("for expressions (for custom columns)", () => {
    it("should resolve segments correctly", () => {
      expect(expr(["trim", A]).segments).toEqual([]);
      expect(expr(["round", B]).segments).toEqual([]);
      expect(expr(["concat", S]).segments).toEqual([]);
      expect(expr(["concat", A, B]).segments).toEqual([]);
      expect(expr(["coalesce", P]).segments).toEqual([]);
      expect(expr(["coalesce", P, Q, R]).segments).toEqual([]);
    });

    it("should resolve dimensions correctly", () => {
      expect(expr(["trim", A]).dimensions).toEqual(["A"]);
      expect(expr(["round", B]).dimensions).toEqual(["B"]);
      expect(expr(["concat", S]).dimensions).toEqual(["S"]);
      expect(expr(["concat", A, B]).dimensions).toEqual(["A", "B"]);
      expect(expr(["coalesce", P]).dimensions).toEqual(["P"]);
      expect(expr(["coalesce", P, Q, R]).dimensions).toEqual(["P", "Q", "R"]);
      expect(expr(["in", A, B, C]).dimensions).toEqual(["A", "B", "C"]);
      expect(expr(["text", A]).dimensions).toEqual(["A"]);
      expect(expr(["integer", A]).dimensions).toEqual(["A"]);
    });

    it("should allow nested datetime expressions", () => {
      expect(() => expr(["get-year", ["now"]])).not.toThrow();
    });

    describe("datetime functions", () => {
      it("should resolve unchained functions", () => {
        expect(() => expr(["get-week", "2022-01-01"])).not.toThrow();
        expect(() =>
          expr(["datetime-add", "2022-01-01", 1, "month"]),
        ).not.toThrow();

        // TODO: Implementation should be fine-tuned so that these throw
        // as they are not really datetime
        expect(() => expr(["get-day", A])).not.toThrow();
        expect(() => expr(["get-day", "a"])).not.toThrow();
        expect(() => expr(["get-day-of-week", A])).not.toThrow();
        expect(() => expr(["get-day-of-week", "a"])).not.toThrow();
        expect(() => expr(["get-week", A])).not.toThrow();
        expect(() => expr(["get-week", "a"])).not.toThrow();
        expect(() => expr(["get-month", A])).not.toThrow();
        expect(() => expr(["get-month", "a"])).not.toThrow();
        expect(() => expr(["get-quarter", A])).not.toThrow();
        expect(() => expr(["get-quarter", "a"])).not.toThrow();
        expect(() => expr(["get-year", A])).not.toThrow();
        expect(() => expr(["get-year", "a"])).not.toThrow();
      });

      it("should resolve chained commmands", () => {
        expect(() =>
          expr([
            "datetime-subtract",
            ["datetime-add", "2022-01-01", 1, "month"],
            2,
            "minute",
          ]),
        ).not.toThrow();
      });

      it("should chain datetime functions onto functions of compatible types", () => {
        expect(() =>
          expr([
            "concat",
            ["datetime-add", "2022-01-01", 1, "month"],
            "a string",
          ]),
        ).not.toThrow();
      });
    });
  });

  describe("for aggregations", () => {
    it("should resolve dimensions correctly", () => {
      expect(aggregation(A).dimensions).toEqual([]);
      expect(aggregation(["cum-sum", B]).dimensions).toEqual(["B"]);
      expect(aggregation(["-", 5, ["avg", C]]).dimensions).toEqual(["C"]);
      expect(aggregation(["share", [">", P, 3]]).dimensions).toEqual(["P"]);
      expect(aggregation(["max", ["*", 4, Q]]).dimensions).toEqual(["Q"]);
      expect(aggregation(["+", R, ["median", S]]).dimensions).toEqual(["S"]);
    });

    it("should resolve metrics correctly", () => {
      expect(aggregation(A).metrics).toEqual(["A"]);
      expect(aggregation(["cum-sum", B]).metrics).toEqual([]);
      expect(aggregation(["-", 5, ["avg", C]]).metrics).toEqual([]);
      expect(aggregation(["share", [">", P, 3]]).metrics).toEqual([]);
      expect(aggregation(["max", ["*", 4, Q]]).metrics).toEqual([]);
      expect(aggregation(["+", R, ["median", S]]).metrics).toEqual(["R"]);
    });

    it("should accept PERCENTILE with two arguments", () => {
      // PERCENTILE(A, 0.5)
      expect(() => aggregation(["percentile", A, 0.5])).not.toThrow();
    });

    it("should handle Distinct/Min/Max aggregating over non-numbers", () => {
      // DISTINCT(COALESCE("F")) also for MIN and MAX
      expect(() => aggregation(["distinct", ["coalesce", "F"]])).not.toThrow();
      expect(() => aggregation(["min", ["coalesce", "F"]])).not.toThrow();
      expect(() => aggregation(["max", ["coalesce", "F"]])).not.toThrow();
    });
  });

  describe("for CASE expressions", () => {
    const expr = (expr: Expression) => collect(expr, "expression");

    it("should handle CASE with two arguments", () => {
      // CASE(A,B)
      expect(expr(["case", [[A, B]]]).segments).toEqual(["A"]);
      expect(expr(["case", [[A, B]]]).dimensions).toEqual(["B"]);
    });

    it("should handle CASE with three arguments", () => {
      // CASE(P, Q, R)
      const opt = { default: R };
      expect(expr(["case", [[P, Q]], opt]).segments).toEqual(["P"]);
      expect(expr(["case", [[P, Q]], opt]).dimensions).toEqual(["Q", "R"]);
    });

    it("should handle CASE with four arguments", () => {
      // CASE(A, B, P, Q)
      const ab: [Expression, Expression] = [A, B];
      const pq: [Expression, Expression] = [P, Q];
      expect(expr(["case", [ab, pq]]).segments).toEqual(["A", "P"]);
      expect(expr(["case", [ab, pq]]).dimensions).toEqual(["B", "Q"]);
    });

    it("should handle CASE with five arguments", () => {
      // CASE(A, B, P, Q, R)
      const ab: [Expression, Expression] = [A, B];
      const pq: [Expression, Expression] = [P, Q];
      const opt: CaseOptions = { default: R };
      expect(expr(["case", [ab, pq], opt]).segments).toEqual(["A", "P"]);
      expect(expr(["case", [ab, pq], opt]).dimensions).toEqual(["B", "Q", "R"]);
    });

    it("should handle CASE with two complex arguments", () => {
      // CASE(P < 2, Q)
      expect(expr(["case", [[["<", P, 2], Q]]]).segments).toEqual([]);
      expect(expr(["case", [[["<", P, 2], Q]]]).dimensions).toEqual(["P", "Q"]);
    });

    it("should handle nested CASE", () => {
      // CASE(P, Q, CASE(A, B))
      const opt: CaseOptions = { default: ["case", [[A, B]]] };
      expect(expr(["case", [[P, Q]], opt]).segments).toEqual(["P", "A"]);
      expect(expr(["case", [[P, Q]], opt]).dimensions).toEqual(["Q", "B"]);
    });

    it("should handle CASE inside COALESCE", () => {
      // COALESCE(CASE(A, B))
      expect(expr(["coalesce", ["case", [[A, B]]]]).segments).toEqual(["A"]);
      expect(expr(["coalesce", ["case", [[A, B]]]]).dimensions).toEqual(["B"]);
    });

    it("should accept a CASE expression with complex arguments", () => {
      // CASE(X, 0.5*Y, A-B)
      const def: CaseOptions = { default: ["-", A, B] };
      expect(() => expr(["case", [[X, ["*", 0.5, Y]]], def])).not.toThrow();
    });

    it("should allow sum inside expression in aggregation", () => {
      // CASE(SUM(A) > 10, B)
      expect(() => expr(["case", [[[">", ["sum", A], 10], B]]])).not.toThrow();
    });

    it("should accept IF as an alias for CASE", () => {
      expect(expr(["if", [[A, B]]]).segments).toEqual(["A"]);
      expect(expr(["if", [[A, B]]]).dimensions).toEqual(["B"]);
    });
  });

  it("should not fail on literal 0", () => {
    const expr = (expr: Expression) => collect(expr, "expression").expression;
    const opt = { default: 0 };

    expect(expr(["case", [[X, 0]]])).toEqual(["case", [[X, 0]]]);

    expect(expr(["case", [[X, 0]], opt])).toEqual(["case", [[X, 0]], opt]);
    expect(expr(["case", [[X, 2]], opt])).toEqual(["case", [[X, 2]], opt]);
  });

  it("should reject unknown function", () => {
    expect(() => expr(["foobar", 42])).toThrow();
  });

  describe("coalesce", () => {
    it("should resolve coalesce correctly", () => {
      expect(expr(["coalesce", A])).toEqual({
        dimensions: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Array),
      });
      expect(filter(["coalesce", A])).toEqual({
        dimensions: [],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Array),
      });
      expect(aggregation(["coalesce", A])).toEqual({
        dimensions: [],
        segments: [],
        metrics: ["A"],
        expression: expect.any(Array),
      });
      expect(aggregation(["trim", ["coalesce", A]])).toEqual({
        dimensions: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Array),
      });
    });

    it("should accept COALESCE for number", () => {
      expect(() => expr(["round", ["coalesce", 0]])).not.toThrow();
    });

    it("should accept COALESCE for string", () => {
      expect(() => expr(["trim", ["coalesce", "B"]])).not.toThrow();
    });

    it("should honor CONCAT's implicit casting", () => {
      expect(() => expr(["concat", ["coalesce", "B", 1]])).not.toThrow();
    });
  });

  describe("comparison operators", () => {
    it.each(["<", "<=", ">", ">="])("should resolve both args to %s", (op) => {
      expect(expr([op, A, B]).dimensions).toEqual(["A", "B"]);
      expect(filter([op, A, B]).dimensions).toEqual(["A", "B"]);
      expect(aggregation([op, A, B]).dimensions).toEqual(["A", "B"]);
      expect(aggregation(["count-where", [op, A, B]]).dimensions).toEqual([
        "A",
        "B",
      ]);
    });
  });

  describe("number operators", () => {
    it.each(["+", "-", "*", "/"])(
      "should resolve all %s args correctly",
      (op) => {
        expect(expr([op, A, B, C])).toEqual({
          dimensions: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Array),
        });
        expect(filter([op, A, B, C])).toEqual({
          dimensions: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Array),
        });
        expect(aggregation([op, A, B, C])).toEqual({
          dimensions: [],
          segments: [],
          metrics: ["A", "B", "C"],
          expression: expect.any(Array),
        });
      },
    );
  });

  describe("logic operators", () => {
    it.each(["and", "or"])("should resolve all args to %s correctly", (op) => {
      expect(expr([op, A, B, C])).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A", "B", "C"],
        expression: expect.any(Array),
      });
      expect(filter([op, A, B, C])).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A", "B", "C"],
        expression: expect.any(Array),
      });
      expect(aggregation([op, A, B, C])).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A", "B", "C"],
        expression: expect.any(Array),
      });
    });

    it("should resolve not args correctly", () => {
      expect(expr(["not", A])).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Array),
      });
      expect(filter(["not", A])).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Array),
      });
      expect(aggregation(["not", A])).toEqual({
        dimensions: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Array),
      });
    });
  });
});
