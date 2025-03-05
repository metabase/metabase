import { createQuery } from "metabase-lib/test-helpers";

import { countMatchingParentheses, diagnose } from "./diagnostics";
import { tokenize } from "./tokenizer";

describe("diagnostics", () => {
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
