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
        ["field-id", 1],
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
});
