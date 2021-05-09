// import { compile } from "metabase/lib/expressions/compile";

import {
  shared,
  aggregationOpts,
  expressionOpts,
} from "./__support__/expressions";

const ENABLE_PERF_TESTS = false; //!process.env["CI"];

function expectFast(fn, milliseconds = 1000) {
  const start = Date.now();
  fn();
  const end = Date.now();
  if (ENABLE_PERF_TESTS) {
    expect(end - start).toBeLessThan(milliseconds);
  }
}

describe("metabase/lib/expressions/compile", () => {
  let compile, parseOperators;
  it("should load compile quickly", () => {
    expectFast(() => {
      ({
        compile,
        parseOperators,
      } = require("metabase/lib/expressions/compile"));
    });
  });

  describe("parseOperators", () => {
    it("should compile 1", () => {
      expect(parseOperators([1], [])).toEqual(1);
    });
    it("should compile 1 + 2", () => {
      expect(parseOperators([1, 2], ["+"])).toEqual(["+", 1, 2]);
    });
    it("should compile 1 + 2 - 3", () => {
      expect(parseOperators([1, 2, 3], ["+", "-"])).toEqual([
        "-",
        ["+", 1, 2],
        3,
      ]);
    });
    it("should compile 1 + 2 - 3 + 4", () => {
      expect(parseOperators([1, 2, 3, 4], ["+", "-", "+"])).toEqual([
        "+",
        ["-", ["+", 1, 2], 3],
        4,
      ]);
    });
    it("should compile 1 + 2 * 3 * 4 + 5 + 6", () => {
      expect(
        parseOperators([1, 2, 3, 4, 5, 6], ["+", "*", "*", "+", "+"]),
      ).toEqual(["+", 1, ["*", 2, 3, 4], 5, 6]);
    });
    it("should compile 1 * 2 + 3 + 4 * 5 * 6", () => {
      expect(
        parseOperators([1, 2, 3, 4, 5, 6], ["*", "+", "+", "*", "*"]),
      ).toEqual(["+", ["*", 1, 2], 3, ["*", 4, 5, 6]]);
    });
  });

  describe("compile()", () => {
    for (const [name, cases, opts] of shared) {
      describe(name, () => {
        for (const [source, mbql, description] of cases) {
          if (mbql) {
            it(`should compile ${description}`, () => {
              expectFast(() => {
                expect(compile({ source, ...opts })).toEqual(mbql);
              }, 250);
            });
          } else {
            it(`should not compile ${description}`, () => {
              expectFast(() => {
                expect(() => compile({ source, ...opts })).toThrow();
              }, 250);
            });
          }
        }
      });
    }

    // NOTE: only add tests below for things that don't fit the shared test cases above

    it("should throw exception on invalid input", () => {
      expect(() => compile({ source: "1 + ", ...expressionOpts })).toThrow();
    });

    it("should treat aggregations as case-insensitive", () => {
      expect(compile({ source: "count", ...aggregationOpts })).toEqual([
        "count",
      ]);
      expect(compile({ source: "cOuNt", ...aggregationOpts })).toEqual([
        "count",
      ]);
      expect(compile({ source: "average(A)", ...aggregationOpts })).toEqual([
        "avg",
        ["field", 1, null],
      ]);
    });

    it("should not take a long time to parse long string literals", () => {
      expectFast(() => {
        try {
          compile({
            source: '"12345678901234567901234567890',
            ...expressionOpts,
          });
        } catch (e) {}
      });
    });
  });

  function mockResolve(kind, name) {
    return [kind, name];
  }
  function compileSource(source, startRule) {
    let mbql = null;
    try {
      mbql = compile({ source, startRule, resolve: mockResolve });
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
    return mbql;
  }

  describe("(for an expression)", () => {
    function expr(source) {
      return compileSource(source, "expression");
    }
    it("should compile literals", () => {
      expect(expr("42")).toEqual(42);
      expect(expr("'Universe'")).toEqual("Universe");
    });
    it("should compile dimensions", () => {
      expect(expr("[Price]")).toEqual(["dimension", "Price"]);
      expect(expr("([X])")).toEqual(["dimension", "X"]);
    });
    it("should compile arithmetic operations", () => {
      expect(expr("1+2")).toEqual(["+", 1, 2]);
      expect(expr("3-4")).toEqual(["-", 3, 4]);
      expect(expr("5*6")).toEqual(["*", 5, 6]);
      expect(expr("7/8")).toEqual(["/", 7, 8]);
    });
    it("should compile comparisons", () => {
      expect(expr("1<2")).toEqual(["<", 1, 2]);
      expect(expr("3>4")).toEqual([">", 3, 4]);
      expect(expr("5<=6")).toEqual(["<=", 5, 6]);
      expect(expr("7>=8")).toEqual([">=", 7, 8]);
      expect(expr("9=9")).toEqual(["=", 9, 9]);
      expect(expr("9!=0")).toEqual(["!=", 9, 0]);
    });
    it("should handle parenthesized expression", () => {
      expect(expr("(42)")).toEqual(42);
      expect(expr("((43))")).toEqual(43);
      expect(expr("('Universe')")).toEqual("Universe");
      expect(expr("(('Answer'))")).toEqual("Answer");
      expect(expr("(1+2)")).toEqual(["+", 1, 2]);
      expect(expr("(1+2)/3")).toEqual(["/", ["+", 1, 2], 3]);
      expect(expr("4-(5*6)")).toEqual(["-", 4, ["*", 5, 6]]);
    });
  });

  describe("(for a filter)", () => {
    function filter(source) {
      return compileSource(source, "boolean");
    }
    it("should compile logical operations", () => {
      expect(filter("NOT A")).toEqual(["not", ["segment", "A"]]);
      expect(filter("NOT 0")).toEqual(["not", 0]);
      expect(filter("NOT 'Answer'")).toEqual(["not", "Answer"]);
      expect(filter("NOT NOT 0")).toEqual(["not", ["not", 0]]);
      expect(filter("1 OR 2")).toEqual(["or", 1, 2]);
      expect(filter("2 AND 3")).toEqual(["and", 2, 3]);
      expect(filter("1 OR 2 AND 3")).toEqual(["or", 1, ["and", 2, 3]]);
      expect(filter("NOT 4 OR 5")).toEqual(["or", ["not", 4], 5]);
    });
    it("should compile comparisons", () => {
      expect(filter("Tax>5")).toEqual([">", ["dimension", "Tax"], 5]);
      expect(filter("X=0")).toEqual(["=", ["dimension", "X"], 0]);
    });
    it("should compile segments", () => {
      expect(filter("[Expensive]")).toEqual(["segment", "Expensive"]);
      expect(filter("NOT [Good]")).toEqual(["not", ["segment", "Good"]]);
      expect(filter("NOT Answer")).toEqual(["not", ["segment", "Answer"]]);
    });
    it("should compile negative filters", () => {
      expect(filter("NOT CONTAINS('X','Y')")).toEqual([
        "does-not-contain",
        "X",
        "Y",
      ]);
      expect(filter("NOT ISNULL('P')")).toEqual(["not-null", "P"]);
      expect(filter("NOT ISEMPTY('Q')")).toEqual(["not-empty", "Q"]);
    });
  });

  describe("(for an aggregation)", () => {
    function aggr(source) {
      return compileSource(source, "aggregation");
    }
    it("should handle metric vs dimension vs segment", () => {
      expect(aggr("[TotalOrder]")).toEqual(["metric", "TotalOrder"]);
      expect(aggr("AVERAGE(X)")).toEqual(["avg", ["dimension", "X"]]);
      expect(aggr("COUNTIF(Y)")).toEqual(["count-where", ["segment", "Y"]]);
    });
  });
});
