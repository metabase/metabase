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
      expect(count("()")).toEqual(0);
      expect(count("(")).toEqual(1);
      expect(count(")")).toEqual(-1);
      expect(count("(A+(")).toEqual(2);
      expect(count("SUMIF(")).toEqual(1);
      expect(count("COUNTIF(Deal))")).toEqual(-1);
    });

    it("should catch mismatched parentheses", () => {
      expect(setup({ expression: "FLOOR [Price]/2)" })?.message).toEqual(
        "Expecting an opening parenthesis after function FLOOR",
      );
    });

    it("should catch missing parentheses", () => {
      expect(setup({ expression: "LOWER [Vendor]" })?.message).toEqual(
        "Expecting an opening parenthesis after function LOWER",
      );
    });

    it("should catch invalid characters", () => {
      expect(setup({ expression: "[Price] / #" })?.message).toEqual(
        "Invalid character: #",
      );
    });

    it("should catch unterminated string literals", () => {
      expect(setup({ expression: '[Category] = "widget' })?.message).toEqual(
        "Missing closing quotes",
      );
    });

    it("should catch unterminated field reference", () => {
      expect(setup({ expression: "[Price / 2" })?.message).toEqual(
        "Missing a closing bracket",
      );
    });

    it("should show the correct number of CASE arguments in a custom expression", () => {
      expect(setup({ expression: "CASE([Total] > 0)" })?.message).toEqual(
        "CASE expects 2 arguments or more",
      );
    });

    it("should show the correct number of function arguments in a custom expression", () => {
      expect(
        setup({ expression: "between([Tax])", startRule: "boolean" })?.message,
      ).toEqual("Function between expects 3 arguments");
    });

    it("should catch missing comma in function arguments", () => {
      expect(setup({ expression: 'concat([Tax] "test")' })?.message).toEqual(
        'Expecting operator but got "test" instead',
      );
    });

    it("should catch unknown functions", () => {
      expect(err("unknown()")).toEqual("Unknown function unknown");
    });

    describe("arg count validation", () => {
      it("should catch mismatched number of function parameters", () => {
        expect(err(`between()`)).toEqual(
          "Function between expects 3 arguments",
        );
        expect(err(`between(1)`)).toEqual(
          "Function between expects 3 arguments",
        );
        expect(err(`between(1, 2)`)).toEqual(
          "Function between expects 3 arguments",
        );
        expect(err(`between(1, 2, 3, 4)`)).toEqual(
          "Function between expects 3 arguments",
        );
      });

      it("should accept multiple arguments for number operators", () => {
        expect(err(`1 + 2 + 3 + 4`)).toBeUndefined();
      });

      it.each(["in", "notIn"])(
        "should reject multi-arg function calls without options when there is not enough arguments",
        (fn) => {
          expect(err(`${fn}()`)).toEqual(
            `Function ${fn} expects at least 2 arguments`,
          );
          expect(err(`${fn}("foo")`)).toEqual(
            `Function ${fn} expects at least 2 arguments`,
          );
          expect(err(`${fn}("foo", "bar")`)).toBeUndefined();
          expect(err(`${fn}("foo", "bar", "baz")`)).toBeUndefined();
        },
      );

      it.each(["contains", "doesNotContain", "startsWith", "endsWith"])(
        "should reject when there is not enough arguments for %s",
        (fn) => {
          expect(err(`${fn}()`)).toEqual(
            `Function ${fn} expects at least 2 arguments`,
          );
          expect(err(`${fn}("foo")`)).toEqual(
            `Function ${fn} expects at least 2 arguments`,
          );

          // TODO?
          // expect(
          //   setup({ expression: `${fn}("foo", "case-insensitive")` })?.message,
          // ).toEqual(`Function ${fn} expects at least 2 arguments`);

          expect(
            err(`${fn}("foo", "bar", "case-insensitive")`),
          ).toBeUndefined();

          expect(
            err(`${fn}("foo", "bar", "baz", "case-insensitive")`),
          ).toBeUndefined();
        },
      );

      it("should allow any number of arguments in a variadic function", () => {
        expect(err(`concat("foo", "bar")`)).toBeUndefined();
        expect(err(`concat("foo", "bar", "baz")`)).toBeUndefined();
        expect(err(`concat("foo", "bar", "baz", "quu")`)).toBeUndefined();
      });
    });

    describe("arg validation", () => {
      it("should not allow substring with index=0", () => {
        expect(err(`substring("foo", 0, 1)`)).toEqual(
          "Expected positive integer but found 0",
        );
        expect(err(`substring("foo", 1, 1)`)).toBeUndefined();
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

      expect(err(`percentile(1, 2)`, "expression", metadata)).toEqual(
        "Unsupported function percentile",
      );
    });

    it("should reject comparison operator with non-field operand", () => {
      expect(err("1 < 2")).toEqual("Expecting field but found 1");
      expect(err("1 <= 2")).toEqual("Expecting field but found 1");
      expect(err("1 > 2")).toEqual("Expecting field but found 1");
      expect(err("1 >= 2")).toEqual("Expecting field but found 1");
      expect(err("1 = 2")).toEqual("Expecting field but found 1");
      expect(err("1 != 2")).toEqual("Expecting field but found 1");

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
      expect(err("case([Total] > 0)")).toEqual(
        "CASE expects 2 arguments or more",
      );
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
      expect(result.error?.message).toEqual("Expected expression");
    });
  });
});
