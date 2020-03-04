// import { compile } from "metabase/lib/expressions/compile";

import {
  shared,
  aggregationOpts,
  expressionOpts,
} from "./__support__/expressions";

describe("metabase/lib/expressions/compile", () => {
  let compile, parseOperators;
  fit("should load compile within 3 seconds", () => {
    const start = Date.now();
    ({ compile, parseOperators } = require("metabase/lib/expressions/compile"));
    const end = Date.now();
    expect(end - start).toBeLessThan(3000);
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
      fdescribe(name, () => {
        for (const [source, mbql, description] of cases) {
          if (mbql) {
            it(`should compile ${description}`, () => {
              const start = Date.now();
              expect(compile({ source, ...opts })).toEqual(mbql);
              const elapsed = Date.now() - start;
              expect(elapsed).toBeLessThan(250);
            });
          } else {
            it(`should not compile ${description}`, () => {
              const start = Date.now();
              expect(() => compile({ source, ...opts })).toThrow();
              const elapsed = Date.now() - start;
              expect(elapsed).toBeLessThan(250);
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
  });
});
