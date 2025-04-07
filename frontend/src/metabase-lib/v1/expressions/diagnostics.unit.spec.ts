import { createMockMetadata } from "__support__/metadata";
import { createQuery } from "metabase-lib/test-helpers";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  countMatchingParentheses,
  diagnose,
  diagnoseAndCompile,
} from "./diagnostics";
import { lexify } from "./pratt";
import type { StartRule } from "./types";

describe("diagnostics", () => {
  describe("diagnose", () => {
    function setup({
      expression,
      startRule = "expression",
      metadata,
    }: {
      expression: string;
      startRule?: StartRule;
      metadata?: Metadata;
    }) {
      const query = createQuery();
      const stageIndex = -1;
      return diagnose({
        source: expression,
        startRule,
        query,
        stageIndex,
        metadata,
      });
    }

    function err(
      expression: string,
      startRule: StartRule = "expression",
      metadata?: Metadata,
    ) {
      return setup({ expression, startRule, metadata })?.message;
    }

    it("should count matching parentheses", () => {
      const count = (expr: string) =>
        countMatchingParentheses(lexify(expr).tokens);
      expect(count("()")).toBe(0);
      expect(count("(")).toBe(1);
      expect(count(")")).toBe(-1);
      expect(count("(A+(")).toBe(2);
      expect(count("SUMIF(")).toBe(1);
      expect(count("COUNTIF(Deal))")).toBe(-1);
    });

    it("should catch mismatched parentheses", () => {
      expect(err("FLOOR [Price]/2)")).toBe(
        "Expecting an opening parenthesis after function FLOOR",
      );
    });

    it("should catch missing parentheses", () => {
      expect(err("LOWER [Vendor]")).toBe(
        "Expecting an opening parenthesis after function LOWER",
      );
    });

    it("should catch invalid characters", () => {
      expect(err("[Price] / #")).toBe("Invalid character: #");
    });

    it("should catch unterminated string literals", () => {
      expect(err('[Category] = "widget')).toBe("Missing closing quotes");
    });

    it("should catch unterminated field reference", () => {
      expect(err("[Price / 2")).toBe("Missing a closing bracket");
    });

    it("should show the correct number of CASE arguments in a custom expression", () => {
      expect(err("CASE([Total] > 0)")).toBe("CASE expects 2 arguments or more");
    });

    it("should show the correct number of function arguments in a custom expression", () => {
      expect(err("between([Tax])", "boolean")).toBe(
        "Function between expects 3 arguments",
      );
    });

    it("should catch missing comma in function arguments", () => {
      expect(err('concat([Tax] "test")')).toBe(
        'Expecting operator but got "test" instead',
      );
    });

    it("should catch unknown functions", () => {
      expect(err("unknown()")).toBe("Unknown function unknown");
    });

    describe("arg count validation", () => {
      it("should catch mismatched number of function parameters", () => {
        expect(err(`between()`)).toBe("Function between expects 3 arguments");
        expect(err(`between(1)`)).toBe("Function between expects 3 arguments");
        expect(err(`between(1, 2)`)).toBe(
          "Function between expects 3 arguments",
        );
        expect(err(`between(1, 2, 3, 4)`)).toBe(
          "Function between expects 3 arguments",
        );
      });

      it("should accept multiple arguments for number operators", () => {
        expect(err(`1 + 2 + 3 + 4`)).toBeUndefined();
      });

      it("should accept multiple arguments for logical operators", () => {
        expect(
          err(`(1 > 2) and (2 > 3) and (3 > 4) and (4 > 5)`),
        ).toBeUndefined();
      });

      it.each(["in", "notIn"])(
        "should reject multi-arg function calls without options when there is not enough arguments",
        (fn) => {
          expect(err(`${fn}()`)).toBe(
            `Function ${fn} expects at least 2 arguments`,
          );
          expect(err(`${fn}("foo")`)).toBe(
            `Function ${fn} expects at least 2 arguments`,
          );
          expect(err(`${fn}("foo", "bar")`)).toBeUndefined();
          expect(err(`${fn}("foo", "bar", "baz")`)).toBeUndefined();
        },
      );

      it.each(["contains", "doesNotContain", "startsWith", "endsWith"])(
        "should reject when there is not enough arguments for %s",
        (fn) => {
          expect(err(`${fn}()`)).toBe(
            `Function ${fn} expects at least 2 arguments`,
          );
          expect(err(`${fn}("foo")`)).toBe(
            `Function ${fn} expects at least 2 arguments`,
          );

          expect(err(`${fn}("foo", "bar")`)).toBeUndefined();

          expect(err(`${fn}("case-insensitive")`)).toBe(
            `Function ${fn} expects at least 2 arguments`,
          );

          expect(err(`${fn}("foo", "case-insensitive")`)).toBe(
            `Function ${fn} expects at least 2 arguments`,
          );

          expect(
            err(`${fn}("foo", "bar", "case-insensitive")`),
          ).toBeUndefined();

          expect(
            err(`${fn}("foo", "bar", "baz", "case-insensitive")`),
          ).toBeUndefined();
        },
      );

      it("should reject when there is not enough arguments for interval", () => {
        expect(err(`interval()`)).toBe(`Function interval expects 3 arguments`);
        expect(err(`interval([Created At])`)).toBe(
          `Function interval expects 3 arguments`,
        );

        expect(err(`interval([Created At], 1)`)).toBe(
          `Function interval expects 3 arguments`,
        );

        expect(err(`interval("include-current")`)).toBe(
          `Function interval expects 3 arguments`,
        );

        expect(err(`interval("foo", "include-current")`)).toBe(
          `Function interval expects 3 arguments`,
        );

        expect(err(`interval([Created At], 1, "month")`)).toBeUndefined();

        expect(
          err(`interval([Created At], 1, "month", "include-current")`),
        ).toBeUndefined();
      });

      it.each(["week", "weekday"])(
        "should reject when there is not enough arguments for %s",
        (fn) => {
          expect(err(`${fn}()`)).toBe(`Function ${fn} expects 1 argument`);
          expect(err(`${fn}([Created At])`)).toBeUndefined();
          expect(err(`${fn}([Created At], "US")`)).toBeUndefined();
        },
      );

      it("should allow any number of arguments in a variadic function", () => {
        expect(err(`concat("foo", "bar")`)).toBeUndefined();
        expect(err(`concat("foo", "bar", "baz")`)).toBeUndefined();
        expect(err(`concat("foo", "bar", "baz", "quu")`)).toBeUndefined();
      });
    });

    describe("arg validation", () => {
      describe("substring", () => {
        it("should reject substring with index <= 0", () => {
          expect(err(`substring("foo", 0, 1)`)).toBe(
            "Expected positive integer but found 0",
          );
          expect(err(`substring("foo", -1, 1)`)).toBe(
            "Expected positive integer but found -1",
          );
        });

        it("should accept substring with index >= 1", () => {
          expect(err(`substring("foo", 1, 1)`)).toBeUndefined();
          expect(err(`substring("foo", 2, 1)`)).toBeUndefined();
        });
      });

      describe("split-part", () => {
        it("should reject split-part with index <= 0", () => {
          expect(err(`splitPart("foo", "/", 0)`)).toBe(
            "Expected positive integer but found 0",
          );
          expect(err(`splitPart("foo", "/" ,-1)`)).toBe(
            "Expected positive integer but found -1",
          );
        });

        it("should accept substring with index >= 1", () => {
          expect(err(`splitPart("foo", "/", 1)`)).toBeUndefined();
          expect(err(`splitPart("foo", "/", 2)`)).toBeUndefined();
        });
      });

      describe("offset", () => {
        it("should reject offset with offset = 0", () => {
          expect(err(`Offset([Total], 0)`, "aggregation")).toBe(
            "Row offset cannot be zero",
          );
        });

        it("should accept offset with offset != 0", () => {
          expect(err(`Offset([Total], -2)`, "aggregation")).toBeUndefined();
          expect(err(`Offset([Total], -1)`, "aggregation")).toBeUndefined();
          expect(err(`Offset([Total], 1)`, "aggregation")).toBeUndefined();
          expect(err(`Offset([Total], 2)`, "aggregation")).toBeUndefined();
        });
      });
    });

    it("should reject unsupported function (metabase#39773)", () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            id: 1,
            features: ["left-join"],
          }),
        ],
      });

      expect(err(`percentile(1, 2)`, "expression", metadata)).toBe(
        "Unsupported function percentile",
      );
    });

    it("should reject comparison operator with non-field operand", () => {
      expect(err("1 < 2")).toBe("Expecting field but found 1");
      expect(err("1 <= 2")).toBe("Expecting field but found 1");
      expect(err("1 > 2")).toBe("Expecting field but found 1");
      expect(err("1 >= 2")).toBe("Expecting field but found 1");
      expect(err("1 = 2")).toBe("Expecting field but found 1");
      expect(err("1 != 2")).toBe("Expecting field but found 1");

      expect(err("[Tax] < 2")).toBeUndefined();
      expect(err("[Tax] <= 2")).toBeUndefined();
      expect(err("[Tax] <= 2")).toBeUndefined();
      expect(err("[Tax] >= 2")).toBeUndefined();
      expect(err("[Tax] = 2")).toBeUndefined();
      expect(err("[Tax] != 2")).toBeUndefined();

      expect(err(`[Product → Category] < "abc"`)).toBeUndefined();
      expect(err(`lower([Product → Category]) < "abc"`)).toBeUndefined();
      expect(err(`"abc" <= [Product → Category]`)).toBeUndefined();
      expect(err(`"abc" <= lower([Product → Category])`)).toBeUndefined();
      expect(err(`[Product → Category] = true`)).toBeUndefined();
    });

    it("should reject a CASE expression with only one argument", () => {
      expect(err("case([Total] > 0)")).toBe("CASE expects 2 arguments or more");
    });

    it("should accept top-level literals", () => {
      expect(err(`1`)).toBeUndefined();
      expect(err(`"foo"`)).toBeUndefined();
      expect(err(`true`)).toBeUndefined();
    });
  });

  describe("diagnoseAndCompile", () => {
    function setup({ expression }: { expression: string }) {
      const query = createQuery();
      const stageIndex = -1;
      return diagnoseAndCompile({
        source: expression,
        query,
        stageIndex,
        startRule: "expression",
      });
    }

    it("should not throw", () => {
      const expression = "1";
      expect(() => setup({ expression })).not.toThrow();
    });

    it("should handle valid input", () => {
      const expression = "1 + 1";
      const result = setup({ expression });
      expect(result.error).toBeNull();
    });

    it("should handle invalid input", () => {
      const expression = "1+";
      const result = setup({ expression });
      expect(result.error?.message).toBe("Expected expression");
    });
  });
});
