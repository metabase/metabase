import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { query, stageIndex } from "../test/shared";

import { diagnose, diagnoseAndCompile } from "./diagnostics";

describe("diagnostics", () => {
  describe("diagnose", () => {
    function setup({
      expression,
      expressionMode = "expression",
      database,
    }: {
      expression: string;
      expressionMode?: Lib.ExpressionMode;
      database?: Pick<Database, "features">;
    }) {
      return diagnose({
        source: expression,
        expressionMode,
        query,
        stageIndex,
        availableColumns: Lib.expressionableColumns(query, stageIndex),
        database,
      });
    }

    function err(
      expression: string,
      expressionMode: Lib.ExpressionMode = "expression",
      database?: Pick<Database, "features">,
    ) {
      return setup({ expression, expressionMode, database })?.message;
    }

    it("should catch mismatched parentheses after function", () => {
      expect(err("FLOOR [Price]/2)")).toBe(
        "FLOOR is a function, so it needs parentheses after its name, like FLOOR().",
      );
      expect(err("LOWER [Vendor]")).toBe(
        "LOWER is a function, so it needs parentheses after its name, like LOWER().",
      );
    });

    it("should catch missing parentheses", () => {
      expect(err("(")).toBe(
        "A parenthesis was opened but never closed. Add a ) where it should end.",
      );
      expect(err("(()")).toBe(
        "A parenthesis was opened but never closed. Add a ) where it should end.",
      );
      expect(err("((()")).toBe(
        "A parenthesis was opened but never closed. Add a ) where it should end.",
      );

      expect(err(")")).toBe(
        "There's a closing parenthesis without a matching opening one. Remove it, or add a ( earlier in the expression.",
      );
      expect(err("())")).toBe(
        "There's a closing parenthesis without a matching opening one. Remove it, or add a ( earlier in the expression.",
      );
      expect(err("()))")).toBe(
        "There's a closing parenthesis without a matching opening one. Remove it, or add a ( earlier in the expression.",
      );
    });

    it("should catch invalid characters", () => {
      expect(err("[Price] / #")).toBe(
        "The character # can't be used here. Remove it, or put it inside quotes if it's part of some text.",
      );
    });

    it("should catch unterminated string literals", () => {
      expect(err('[Category] = "widget')).toBe(
        `This text is missing its closing quote. Add a " at the end, like "Done".`,
      );
    });

    it("should catch unterminated field reference", () => {
      expect(err("[Price / 2")).toBe(
        "This column name is missing its closing bracket. Add a ] at the end, like [Total].",
      );
    });

    it("should show the correct number of CASE arguments in a custom expression", () => {
      expect(err("CASE([Total] > 0)")).toBe(
        `case() needs at least a condition and a result, like case([Total] > 100, "Large").`,
      );
    });

    it("should show the correct number of function arguments in a custom expression", () => {
      expect(err("between([Tax])", "filter")).toBe(
        "between() needs 3 values, separated by commas.",
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
              `Something's missing before ${errToken}. Add a comma between values, or a symbol like + or = to connect them.`,
            );
          });

          it(`should catch mismatched adjacent tokens in: concat(${leftToken} ${rightToken})`, () => {
            expect(err(`concat(${leftToken} ${rightToken})`)).toBe(
              `Something's missing before ${errToken}. Add a comma between values, or a symbol like + or = to connect them.`,
            );
          });

          it(`should catch mismatched adjacent tokens in: 2 * (${leftToken} ${rightToken})`, () => {
            expect(err(`2 * (${leftToken} ${rightToken})`)).toBe(
              `Something's missing before ${errToken}. Add a comma between values, or a symbol like + or = to connect them.`,
            );
          });
        }
      }
    });

    it("should catch unknown functions", () => {
      expect(err("unknown()")).toBe(
        "There's no function called unknown(). Check the spelling, or start typing to see matching functions.",
      );
    });

    describe("arg count validation", () => {
      it("should catch mismatched number of function parameters", () => {
        expect(err(`between()`)).toBe(
          "between() needs 3 values, separated by commas.",
        );
        expect(err(`between(1)`)).toBe(
          "between() needs 3 values, separated by commas.",
        );
        expect(err(`between(1, 2)`)).toBe(
          "between() needs 3 values, separated by commas.",
        );
        expect(err(`between(1, 2, 3, 4)`)).toBe(
          "between() needs 3 values, separated by commas.",
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

      it("should accept a parenthesized OR inside an AND in filter mode", () => {
        expect(
          err("([ID] > 2 OR [Subtotal] = 100) and [Tax] < 4", "filter"),
        ).toBeUndefined();
        expect(err("([ID] > 2 OR [Subtotal] = 100) and", "filter")).toBe(
          "Something's missing here. Add a column, value or function to finish the expression.",
        );
      });

      it("should reject non-boolean expressions in filter mode", () => {
        expect(err("[Tax] * 22", "filter")).toBe(
          "A filter has to be true or false for each row. Add a comparison, like [Total] > 100.",
        );
        expect(err("3.14159", "filter")).toBe(
          "A filter has to be true or false for each row. Add a comparison, like [Total] > 100.",
        );
        expect(err('"TheAnswer"', "filter")).toBe(
          "A filter has to be true or false for each row. Add a comparison, like [Total] > 100.",
        );
        expect(err("[Total] > 10", "filter")).toBeUndefined();
      });

      it.each(["in", "notIn"])(
        "should reject multi-arg function calls without options when there is not enough arguments",
        (fn) => {
          expect(err(`${fn}()`)).toBe(
            `${fn}() needs at least 2 values, separated by commas.`,
          );
          expect(err(`${fn}("foo")`)).toBe(
            `${fn}() needs at least 2 values, separated by commas.`,
          );
          expect(err(`${fn}("foo", "bar")`)).toBeUndefined();
          expect(err(`${fn}("foo", "bar", "baz")`)).toBeUndefined();
        },
      );

      it.each(["contains", "doesNotContain", "startsWith", "endsWith"])(
        "should reject when there is not enough arguments for %s",
        (fn) => {
          expect(err(`${fn}()`)).toBe(
            `${fn}() needs at least 2 values, separated by commas.`,
          );
          expect(err(`${fn}("foo")`)).toBe(
            `${fn}() needs at least 2 values, separated by commas.`,
          );

          expect(err(`${fn}("foo", "bar")`)).toBeUndefined();

          expect(err(`${fn}("case-insensitive")`)).toBe(
            `${fn}() needs at least 2 values, separated by commas.`,
          );

          expect(err(`${fn}("foo", "case-insensitive")`)).toBe(
            `${fn}() needs at least 2 values, separated by commas.`,
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
        expect(err(`interval()`)).toBe(
          `interval() needs 3 values, separated by commas.`,
        );
        expect(err(`interval([Created At])`)).toBe(
          `interval() needs 3 values, separated by commas.`,
        );

        expect(err(`interval([Created At], 1)`)).toBe(
          `interval() needs 3 values, separated by commas.`,
        );

        expect(err(`interval("include-current")`)).toBe(
          `interval() needs 3 values, separated by commas.`,
        );

        expect(err(`interval("foo", "include-current")`)).toBe(
          `interval() needs 3 values, separated by commas.`,
        );

        expect(err(`interval([Created At], 1, "month")`)).toBeUndefined();

        expect(
          err(`interval([Created At], 1, "month", "include-current")`),
        ).toBeUndefined();
      });

      it.each(["week", "weekday"])(
        "should reject when there is not enough arguments for %s",
        (fn) => {
          expect(err(`${fn}()`)).toBe(
            `${fn}() needs 1 value inside its parentheses.`,
          );
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
            "Positions start at 1, so this can't be 0. Use 1 or higher.",
          );
          expect(err(`substring("foo", -1, 1)`)).toBe(
            "Positions start at 1, so this can't be -1. Use 1 or higher.",
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
            "Positions start at 1, so this can't be 0. Use 1 or higher.",
          );
          expect(err(`splitPart("foo", "/" ,-1)`)).toBe(
            "Positions start at 1, so this can't be -1. Use 1 or higher.",
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
            "The row offset can't be 0, because that's the current row. Use -1 for the previous row or 1 for the next.",
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
      const database = createSampleDatabase({ features: ["left-join"] });

      expect(err(`percentile(1, 2)`, "expression", database)).toBe(
        "This database doesn't support Percentile(). Try a different function.",
      );
    });

    it("should correctly pass along the position of the error", () => {
      const database = createSampleDatabase({ features: ["left-join"] });

      const error = setup({
        expression: `10 + percentile(1, 2)`,
        expressionMode: "expression",
        database,
      });

      expect(error?.pos).toBe(5);
      expect(error?.len).toBe(10);
    });

    it("should reject comparison operator with non-field operand", () => {
      expect(err("1 < 2")).toBe(
        "The left side of this comparison needs to be a column or calculation, not the number 1. Try something like [Total] > 1.",
      );
      expect(err("1 <= 2")).toBe(
        "The left side of this comparison needs to be a column or calculation, not the number 1. Try something like [Total] > 1.",
      );
      expect(err("1 > 2")).toBe(
        "The left side of this comparison needs to be a column or calculation, not the number 1. Try something like [Total] > 1.",
      );
      expect(err("1 >= 2")).toBe(
        "The left side of this comparison needs to be a column or calculation, not the number 1. Try something like [Total] > 1.",
      );
      expect(err("1 = 2")).toBe(
        "The left side of this comparison needs to be a column or calculation, not the number 1. Try something like [Total] > 1.",
      );
      expect(err("1 != 2")).toBe(
        "The left side of this comparison needs to be a column or calculation, not the number 1. Try something like [Total] > 1.",
      );

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
      expect(err("case([Total] > 0)")).toBe(
        `case() needs at least a condition and a result, like case([Total] > 100, "Large").`,
      );
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
        expect(err(expression)).toBe(
          `This number has an "e" with nothing after it. Add a number, like 1e3, or remove the "e".`,
        );
      });
    });

    describe("string quotes", () => {
      it.each([`"single`, `'double`, `"foo\\"`, `'foo\\'`])(
        "reject missing string quotes for %s",
        (expression) => {
          expect(err(expression)).toBe(
            `This text is missing its closing quote. Add a " at the end, like "Done".`,
          );
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
        expect(err(expression)).toBe(
          "This column name is missing its closing bracket. Add a ] at the end, like [Total].",
        );
      });

      it("should reject missing field quotes for foo]", () => {
        expect(err("foo]")).toMatch(/is missing its opening bracket/);
      });

      it.each([`[`, `[]`])("reject missing field name for %s", (expression) => {
        expect(err(expression)).toBe(
          "This column name is empty. Put a column name between the brackets, like [Total].",
        );
      });

      it.each([`"]"`, `']'`, `concat("[", "]")`, `concat("[", [Total], "]")`])(
        "should accept strings containing brackets, like %s (metabase#82328)",
        (expression) => {
          expect(err(expression)).toBeUndefined();
        },
      );
    });

    describe("bad tokens", () => {
      it.each([`.`, `1°`, `@`, `#`, `%`, `@`, `(])`])(
        "should reject bad tokens like %s",
        (expression) => {
          expect(err(expression)).toMatch(/^The character /);
        },
      );

      it.each([`$#`, `$#@`, `$#@$`, `$#@$#`])(
        "should reject bad tokens like %s",
        (expression) => {
          expect(err(expression)).toMatch(/^This part can't be read/);
        },
      );
    });

    describe("double commas", () => {
      it("should reject repeated commas", () => {
        expect(err(`concat("foo",, "bar")`)).toBe(
          "There are two commas in a row. Remove one, or add the missing value between them.",
        );
        expect(err(`concat("foo", , "bar")`)).toBe(
          "There are two commas in a row. Remove one, or add the missing value between them.",
        );
        expect(err(`concat("foo",,, "bar")`)).toBe(
          "There are two commas in a row. Remove one, or add the missing value between them.",
        );
      });
    });

    it("should reject aggregations functions in expression mode", () => {
      const mode = "expression";
      expect(err("CumulativeCount([Total])", mode)).toBe(
        "CumulativeCount() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("CumulativeSum([Total])", mode)).toBe(
        "CumulativeSum() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Count([Total])", mode)).toBe(
        "Count() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Sum([Total])", mode)).toBe(
        "Sum() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Distinct([Total])", mode)).toBe(
        "Distinct() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Average([Total])", mode)).toBe(
        "Average() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Median([Total])", mode)).toBe(
        "Median() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Min([Total])", mode)).toBe(
        "Min() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Max([Total])", mode)).toBe(
        "Max() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Share([Total] = 10)", mode)).toBe(
        "Share() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("CountIf([Total] = 10)", mode)).toBe(
        "CountIf() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("DistinctIf([Total], [Tax] = 10)", mode)).toBe(
        "DistinctIf() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("SumIf([Total], [Tax] = 10)", mode)).toBe(
        "SumIf() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Variance([Total])", mode)).toBe(
        "Variance() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Percentile([Total], 0.9)", mode)).toBe(
        "Percentile() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
    });

    it("should reject aggregations functions in filter mode", () => {
      const mode = "filter";
      expect(err("CumulativeCount([Total] > 1)", mode)).toBe(
        "CumulativeCount() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("CumulativeSum([Total] > 1)", mode)).toBe(
        "CumulativeSum() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Count([Total] > 1)", mode)).toBe(
        "Count() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Sum([Total])", mode)).toBe(
        "Sum() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Distinct([Total])", mode)).toBe(
        "Distinct() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Average([Total])", mode)).toBe(
        "Average() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Median([Total])", mode)).toBe(
        "Median() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Min([Total])", mode)).toBe(
        "Min() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Max([Total])", mode)).toBe(
        "Max() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Share([Total] = 10)", mode)).toBe(
        "Share() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("CountIf([Total] = 10)", mode)).toBe(
        "CountIf() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("DistinctIf([Total], [Tax] = 10)", mode)).toBe(
        "DistinctIf() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("SumIf([Total], [Tax] = 10)", mode)).toBe(
        "SumIf() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Variance([Total])", mode)).toBe(
        "Variance() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
      );
      expect(err("Percentile([Total], 0.9)", mode)).toBe(
        "Percentile() combines many rows into one value, so it only works in Summarize. Use it there, or choose a function that works on one row at a time.",
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
      expect(result.error?.message).toBe(
        "Something's missing here. Add a column, value or function to finish the expression.",
      );
    });
  });
});
