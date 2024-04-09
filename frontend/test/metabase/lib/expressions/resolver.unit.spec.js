import { createMockMetadata } from "__support__/metadata";
import { resolve } from "metabase-lib/v1/expressions/resolver";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

describe("metabase-lib/v1/expressions/resolve", () => {
  function collect(expr, startRule = "expression") {
    const dimensions = [];
    const segments = [];
    const metrics = [];

    resolve({
      expression: expr,
      type: startRule,
      fn: (kind, name) => {
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
  const A = ["dimension", "A"];
  const B = ["dimension", "B"];
  const C = ["dimension", "C"];
  const P = ["dimension", "P"];
  const Q = ["dimension", "Q"];
  const R = ["dimension", "R"];
  const S = ["dimension", "S"];
  const X = ["segment", "X"];
  const Y = ["dimension", "Y"];

  describe("for filters", () => {
    const filter = e => collect(e, "boolean");

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
      expect(() => filter(["contains"])).toThrow();
      expect(() => filter(["contains", Y])).toThrow();
      expect(() => filter(["contains", Y, "A", "B", "C"])).toThrow();
      expect(() => filter(["starts-with"])).toThrow();
      expect(() => filter(["starts-with", A])).toThrow();
      expect(() => filter(["starts-with", A, "P", "Q", "R"])).toThrow();
      expect(() => filter(["ends-with"])).toThrow();
      expect(() => filter(["ends-with", B])).toThrow();
      expect(() => filter(["ends-with", B, "P", "Q", "R"])).toThrow();
    });

    it("should allow a comparison (lexicographically) on strings", () => {
      // P <= "abc"
      expect(() => filter(["<=", P, "abc"])).not.toThrow();
    });

    it("should allow a comparison (lexicographically) on functions returning string", () => {
      // Lower([A]) <= "P"
      expect(() => filter(["<=", ["lower", A], "P"])).not.toThrow();
    });

    it("should reject a less/greater comparison on functions returning boolean", () => {
      // IsEmpty([A]) < 0
      expect(() => filter(["<", ["is-empty", A], 0])).toThrow();
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
    const expr = e => collect(e, "expression");

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
    const aggregation = e => collect(e, "aggregation");

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
    const expr = e => collect(e, "expression");
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
      const ab = [A, B];
      const pq = [P, Q];
      expect(expr(["case", [ab, pq]]).segments).toEqual(["A", "P"]);
      expect(expr(["case", [ab, pq]]).dimensions).toEqual(["B", "Q"]);
    });
    it("should handle CASE with five arguments", () => {
      // CASE(A, B, P, Q, R)
      const ab = [A, B];
      const pq = [P, Q];
      const opt = { default: R };
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
      const opt = { default: ["case", [[A, B]]] };
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
      const def = { default: ["-", A, B] };
      expect(() => expr(["case", [[X, ["*", 0.5, Y]]], def])).not.toThrow();
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
          features: ["foreign-keys"],
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
