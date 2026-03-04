import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { query, stageIndex } from "../test/shared";

import { diagnose, diagnoseAndCompile } from "./diagnostics";

describe("diagnostics", () => {
  describe("diagnose", () => {
    function setup({
      expression,
      expressionMode = "expression",
      metadata,
    }: {
      expression: string;
      expressionMode?: Lib.ExpressionMode;
      metadata?: Metadata;
    }) {
      return diagnose({
        source: expression,
        expressionMode,
        query,
        stageIndex,
        availableColumns: Lib.expressionableColumns(query, stageIndex),
        metadata,
      });
    }

    function err(
      expression: string,
      expressionMode: Lib.ExpressionMode = "expression",
      metadata?: Metadata,
    ) {
      return setup({ expression, expressionMode, metadata })?.message;
    }

    it("should catch mismatched parentheses after function", () => {
      expect(err("FLOOR [Price]/2)")).toBe(
        "Expecting an opening parenthesis after function FLOOR",
      );
      expect(err("LOWER [Vendor]")).toBe(
        "Expecting an opening parenthesis after function LOWER",
      );
    });

    it("should catch missing parentheses", () => {
      expect(err("(")).toBe("Expecting a closing parenthesis");
      expect(err("(()")).toBe("Expecting a closing parenthesis");
      expect(err("((()")).toBe("Expecting a closing parenthesis");

      expect(err(")")).toBe("Expecting an opening parenthesis");
      expect(err("())")).toBe("Expecting an opening parenthesis");
      expect(err("()))")).toBe("Expecting an opening parenthesis");
    });

    it("should catch invalid characters", () => {
      expect(err("[Price] / #")).toBe("Unexpected character: #");
    });

    it("should catch unterminated string literals", () => {
      expect(err('[Category] = "widget')).toBe("Missing closing string quote");
    });

    it("should catch unterminated field reference", () => {
      expect(err("[Price / 2")).toBe("Missing a closing bracket");
    });

    it("should show the correct number of CASE arguments in a custom expression", () => {
      expect(err("CASE([Total] > 0)")).toBe("CASE expects 2 arguments or more");
    });

    it("should show the correct number of function arguments in a custom expression", () => {
      expect(err("between([Tax])", "filter")).toBe(
        "Function between expects 3 arguments",
      );
    });

    describe("sibling tokens validation", () => {
      const left = ["[Total]", '"string"', "42", "(10 + 5)", "true"];
      const right = [
        ["[Total]", "[Total]"],
        ['"string"', '"string"'],
        ["42", "42"],
        ["(10 + 5)", "("],
        ["tax", "tax"],
        ["ceil(10.5)", "ceil"],
      ];

      for (const leftToken of left) {
        for (const [rightToken, errToken] of right) {
          it(`should catch mismatched adjacent tokens in: ${leftToken} ${rightToken}`, () => {
            expect(err(`${leftToken} ${rightToken}`)).toBe(
              `Expecting operator but got ${errToken} instead`,
            );
          });

          it(`should catch mismatched adjacent tokens in: concat(${leftToken} ${rightToken})`, () => {
            expect(err(`concat(${leftToken} ${rightToken})`)).toBe(
              `Expecting operator but got ${errToken} instead`,
            );
          });

          it(`should catch mismatched adjacent tokens in: 2 * (${leftToken} ${rightToken})`, () => {
            expect(err(`2 * (${leftToken} ${rightToken})`)).toBe(
              `Expecting operator but got ${errToken} instead`,
            );
          });
        }
      }
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
          err(`([Tax] > 2) and ([Tax] > 3) and ([Tax] > 4) and ([Tax] > 5)`),
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
        "Unsupported function Percentile",
      );
    });

    it("should correctly pass along the position of the error", () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            id: 1,
            features: ["left-join"],
          }),
        ],
      });

      const error = setup({
        expression: `10 + percentile(1, 2)`,
        expressionMode: "expression",
        metadata,
      });

      expect(error?.pos).toBe(5);
      expect(error?.len).toBe(10);
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

    describe("mathematical notation", () => {
      it.each([
        "1E",
        "1e",
        "1.2E",
        "1.2e",
        "1E+",
        "1e+",
        "1.2E+",
        "1.2e+",
        "1E-",
        "1e-",
        "1.2E-",
        "1.2e-",
        "1.2e-",
        ".1E",
        ".1e",
        ".1E+",
        ".1e+",
        ".1E-",
        ".1e-",
        ".1E-",
        "2e",
        "3e+",
        "4E-",
        "4E-",
      ])("handles missing exponents for %s", (expression) => {
        expect(err(expression)).toBe("Missing exponent");
      });
    });

    describe("string quotes", () => {
      it.each([`"single`, `'double`, `"foo\\"`, `'foo\\'`])(
        "reject missing string quotes for %s",
        (expression) => {
          expect(err(expression)).toBe("Missing closing string quote");
        },
      );
    });

    describe("field quotes", () => {
      it.each([
        `[foo`,
        `[foo \\[`,
        `[foo \\]`,
        `[foo \\] bar`,
        `[foo \\[ bar`,
        `[foo \\[ bar \\]`,
      ])("reject missing closing field quotes for %s", (expression) => {
        expect(err(expression)).toBe("Missing a closing bracket");
      });

      it("should reject missing field quotes for foo]", () => {
        expect(err("foo]")).toMatch(/^Missing an opening bracket for /);
      });

      it.each([`[`, `[]`])("reject missing field name for %s", (expression) => {
        expect(err(expression)).toBe("Expected a field name");
      });
    });

    describe("bad tokens", () => {
      it.each([`.`, `1°`, `@`, `#`, `%`, `@`, `(])`])(
        "should reject bad tokens like %s",
        (expression) => {
          expect(err(expression)).toMatch(/^Unexpected character/);
        },
      );

      it.each([`$#`, `$#@`, `$#@$`, `$#@$#`])(
        "should reject bad tokens like %s",
        (expression) => {
          expect(err(expression)).toMatch(/^Invalid expression/);
        },
      );
    });

    describe("double commas", () => {
      it("should reject repeated commas", () => {
        expect(err(`concat("foo",, "bar")`)).toBe(
          "Expected expression but got: ,",
        );
        expect(err(`concat("foo", , "bar")`)).toBe(
          "Expected expression but got: ,",
        );
        expect(err(`concat("foo",,, "bar")`)).toBe(
          "Expected expression but got: ,",
        );
      });
    });

    it("should reject aggregations functions in expression mode", () => {
      const mode = "expression";
      expect(err("CumulativeCount([Total])", mode)).toBe(
        "Aggregations like CumulativeCount are not allowed when building a custom expression",
      );
      expect(err("CumulativeSum([Total])", mode)).toBe(
        "Aggregations like CumulativeSum are not allowed when building a custom expression",
      );
      expect(err("Count([Total])", mode)).toBe(
        "Aggregations like Count are not allowed when building a custom expression",
      );
      expect(err("Sum([Total])", mode)).toBe(
        "Aggregations like Sum are not allowed when building a custom expression",
      );
      expect(err("Distinct([Total])", mode)).toBe(
        "Aggregations like Distinct are not allowed when building a custom expression",
      );
      expect(err("Average([Total])", mode)).toBe(
        "Aggregations like Average are not allowed when building a custom expression",
      );
      expect(err("Median([Total])", mode)).toBe(
        "Aggregations like Median are not allowed when building a custom expression",
      );
      expect(err("Min([Total])", mode)).toBe(
        "Aggregations like Min are not allowed when building a custom expression",
      );
      expect(err("Max([Total])", mode)).toBe(
        "Aggregations like Max are not allowed when building a custom expression",
      );
      expect(err("Share([Total] = 10)", mode)).toBe(
        "Aggregations like Share are not allowed when building a custom expression",
      );
      expect(err("CountIf([Total] = 10)", mode)).toBe(
        "Aggregations like CountIf are not allowed when building a custom expression",
      );
      expect(err("DistinctIf([Total], [Tax] = 10)", mode)).toBe(
        "Aggregations like DistinctIf are not allowed when building a custom expression",
      );
      expect(err("SumIf([Total], [Tax] = 10)", mode)).toBe(
        "Aggregations like SumIf are not allowed when building a custom expression",
      );
      expect(err("Variance([Total])", mode)).toBe(
        "Aggregations like Variance are not allowed when building a custom expression",
      );
      expect(err("Percentile([Total], 0.9)", mode)).toBe(
        "Aggregations like Percentile are not allowed when building a custom expression",
      );
    });

    it("should reject aggregations functions in filter mode", () => {
      const mode = "filter";
      expect(err("CumulativeCount([Total] > 1)", mode)).toBe(
        "Aggregations like CumulativeCount are not allowed when building a custom filter",
      );
      expect(err("CumulativeSum([Total] > 1)", mode)).toBe(
        "Aggregations like CumulativeSum are not allowed when building a custom filter",
      );
      expect(err("Count([Total] > 1)", mode)).toBe(
        "Aggregations like Count are not allowed when building a custom filter",
      );
      expect(err("Sum([Total])", mode)).toBe(
        "Aggregations like Sum are not allowed when building a custom filter",
      );
      expect(err("Distinct([Total])", mode)).toBe(
        "Aggregations like Distinct are not allowed when building a custom filter",
      );
      expect(err("Average([Total])", mode)).toBe(
        "Aggregations like Average are not allowed when building a custom filter",
      );
      expect(err("Median([Total])", mode)).toBe(
        "Aggregations like Median are not allowed when building a custom filter",
      );
      expect(err("Min([Total])", mode)).toBe(
        "Aggregations like Min are not allowed when building a custom filter",
      );
      expect(err("Max([Total])", mode)).toBe(
        "Aggregations like Max are not allowed when building a custom filter",
      );
      expect(err("Share([Total] = 10)", mode)).toBe(
        "Aggregations like Share are not allowed when building a custom filter",
      );
      expect(err("CountIf([Total] = 10)", mode)).toBe(
        "Aggregations like CountIf are not allowed when building a custom filter",
      );
      expect(err("DistinctIf([Total], [Tax] = 10)", mode)).toBe(
        "Aggregations like DistinctIf are not allowed when building a custom filter",
      );
      expect(err("SumIf([Total], [Tax] = 10)", mode)).toBe(
        "Aggregations like SumIf are not allowed when building a custom filter",
      );
      expect(err("Variance([Total])", mode)).toBe(
        "Aggregations like Variance are not allowed when building a custom filter",
      );
      expect(err("Percentile([Total], 0.9)", mode)).toBe(
        "Aggregations like Percentile are not allowed when building a custom filter",
      );
    });
  });

  describe("diagnoseAndCompile", () => {
    function setup({ expression }: { expression: string }) {
      return diagnoseAndCompile({
        source: expression,
        query,
        stageIndex,
        expressionMode: "expression",
        availableColumns: Lib.expressionableColumns(query, stageIndex),
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
