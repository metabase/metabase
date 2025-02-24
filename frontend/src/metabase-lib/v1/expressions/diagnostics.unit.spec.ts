import { createQuery } from "metabase-lib/test-helpers";

import {
  countMatchingParentheses,
  diagnose,
  diagnoseAndCompile,
} from "./diagnostics";
import { tokenize } from "./tokenizer";

describe("diagnostics", () => {
  describe("diagnose", () => {
    function setup({
      expression,
      startRule = "expression",
    }: {
      expression: string;
      startRule?: "boolean" | "expression" | "aggregation";
    }) {
      const query = createQuery();
      const stageIndex = -1;
      return diagnose({ source: expression, startRule, query, stageIndex });
    }

    it("should count matching parentheses", () => {
      const count = (expr: string) =>
        countMatchingParentheses(tokenize(expr).tokens);
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
      expect(setup({ expression: "CASE([Price]>0)" })?.message).toEqual(
        "CASE expects 2 arguments or more",
      );
    });

    it("should show the correct number of function arguments in a custom expression", () => {
      expect(
        setup({ expression: "between([Tax])", startRule: "boolean" })?.message,
      ).toEqual("Function between expects 3 arguments");
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

    it("should non throw", () => {
      const expression = "1";
      expect(() => setup({ expression })).not.toThrow();
    });

    it("should handle valid input", () => {
      const expression = "1";
      const result = setup({ expression });
      if (!("error" in result)) {
        return;
      }
      expect(result.error).toBeNull();
    });

    it("should handle invalid input", () => {
      const expression = "1+";
      const result = setup({ expression });
      if (!("error" in result)) {
        return;
      }
      expect(result.error?.message).toEqual("Expected expression");
    });
  });
});
