import { createMockMetadata } from "__support__/metadata";
import type { CallOptions, CaseOptions, Expression } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { resolve } from "./resolver";

describe("resolve", () => {
  function collect(expression: Expression, startRule = "expression") {
    const dimensions: string[] = [];
    const segments: string[] = [];
    const metrics: string[] = [];

    resolve({
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

    return { dimensions, segments, metrics };
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

  describe("for filters", () => {
    const filter = (expr: Expression) => collect(expr, "boolean");

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

    it("should reject a number literal", () => {
      expect(() => filter("3.14159")).toThrow();
    });

    it("should reject a string literal", () => {
      expect(() => filter('"TheAnswer"')).toThrow();
    });

    it("should catch mismatched number of function parameters", () => {
      expect(() => filter(["between"])).toThrow();
      expect(() => filter(["between", Y])).toThrow();
      expect(() => filter(["between", Y, "A", "B", "C"])).toThrow();
    });

    it("should allow a comparison (lexicographically) on strings", () => {
      // P <= "abc"
      expect(() => filter(["<=", P, "abc"])).not.toThrow();
    });

    it("should allow a comparison (lexicographically) on functions returning string", () => {
      // Lower([A]) <= "P"
      expect(() => filter(["<=", ["lower", A], "P"])).not.toThrow();
    });

    // backward-compatibility
    it("should reject a number literal on the left-hand side of a comparison", () => {
      // 0 < [A]
      expect(() => filter(["<", 0, A])).toThrow();
    });

    it("should still allow a string literal on the left-hand side of a comparison", () => {
      // "XYZ" < [B]
      expect(() => filter(["<", "XYZ", B])).not.toThrow();
    });

    it("should allow a boolean literal", () => {
      // [B] = True
      expect(() => filter(["=", B, true])).not.toThrow();
    });

    it("should work on functions with optional flag", () => {
      const flag = { "include-current": true };
      expect(() => filter(["time-interval", A, 3, "day", flag])).not.toThrow();
    });
  });

  describe("for expressions (for custom columns)", () => {
    const expr = (expr: Expression) => collect(expr, "expression");

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
    });

    it("should allow any number of arguments in a variadic function", () => {
      expect(() => expr(["concat", "1"])).not.toThrow();
      expect(() => expr(["concat", "1", "2"])).not.toThrow();
      expect(() => expr(["concat", "1", "2", "3"])).not.toThrow();
    });

    it("should allow nested datetime expressions", () => {
      expect(() => expr(["get-year", ["now"]])).not.toThrow();
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

    describe("arg validation", () => {
      it("should not allow substring with index=0", () => {
        expect(() => expr(["substring", "foo", 0, 1])).toThrow();
      });

      it("should allow substring with index=1", () => {
        expect(() => expr(["substring", "foo", 1, 1])).not.toThrow();
      });

      it.each(["in", "not-in"])(
        "should reject multi-arg function calls without options when there is not enough arguments",
        tag => {
          expect(() => expr([tag])).toThrow();
          expect(() => expr([tag, A])).toThrow();
          expect(() => expr([tag, A, B])).not.toThrow();
          expect(() => expr([tag, A, B, C])).not.toThrow();
        },
      );

      it.each(["contains", "does-not-contain", "starts-with", "ends-with"])(
        "should reject multi-arg function calls with options when there is not enough arguments",
        tag => {
          const options: CallOptions = { "case-sensitive": true };
          expect(() => expr([tag])).toThrow();
          expect(() => expr([tag, A])).toThrow();
          expect(() => expr([tag, A, options])).toThrow();
          expect(() => expr([tag, A, "abc"])).not.toThrow();
          expect(() => expr([tag, A, B])).not.toThrow();
          expect(() => expr([tag, A, B, C])).not.toThrow();
          expect(() => expr([tag, A, B, options])).not.toThrow();
          expect(() => expr([tag, options, A, B, C])).not.toThrow();
        },
      );
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

      it("should throw if chaining datetime functions onto functions of incompatible types", () => {
        expect(() =>
          expr(["trim", ["datetime-add", "2022-01-01", 1, "month"]]),
        ).toThrow();
      });

      it("should throw if passing numbers as arguments expected to be datetime", () => {
        expect(() => expr(["get-day", 15])).toThrow();
        expect(() => expr(["get-day-of-week", 6])).toThrow();
        expect(() => expr(["get-week", 52])).toThrow();
        expect(() => expr(["get-month", 12])).toThrow();
        expect(() => expr(["get-quarter", 3])).toThrow();
        expect(() => expr(["get-year", 2025])).toThrow();
      });
    });
  });

  describe("for aggregations", () => {
    const aggregation = (expr: Expression) => collect(expr, "aggregation");

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

    it("should reject a CASE expression with only one argument", () => {
      // CASE(X)
      expect(() => expr(["case", [], { default: Y }])).toThrow();
    });

    it("should reject a CASE expression with incorrect argument type", () => {
      // CASE(X, 1, 2, 3)
      expect(() =>
        expr([
          "case",
          [
            [X, 1],
            [2, 3],
          ],
        ]),
      ).toThrow();
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
    const opt = { default: 0 };
    expect(resolve({ expression: ["case", [[X, 0]]] })).toEqual([
      "case",
      [[X, 0]],
    ]);
    expect(resolve({ expression: ["case", [[X, 0]], opt] })).toEqual([
      "case",
      [[X, 0]],
      opt,
    ]);
    expect(resolve({ expression: ["case", [[X, 2]], opt] })).toEqual([
      "case",
      [[X, 2]],
      opt,
    ]);
  });

  it("should reject unknown function", () => {
    expect(() => resolve({ expression: ["foobar", 42] })).toThrow();
  });

  it("should reject unsupported function (metabase#39773)", () => {
    const database = createMockMetadata({
      databases: [
        createSampleDatabase({
          id: 1,
          features: ["left-join"],
        }),
      ],
    }).database(1);

    expect(() =>
      resolve({
        expression: ["percentile", 1, 2],
        type: "aggregation",
        database,
      }),
    ).toThrow("Unsupported function percentile");
  });
});
