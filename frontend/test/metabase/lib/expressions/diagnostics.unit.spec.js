import {
  countMatchingParentheses,
  diagnose,
} from "metabase-lib/v1/expressions/diagnostics";
import { tokenize } from "metabase-lib/v1/expressions/tokenizer";

describe("metabase-lib/v1/expressions/diagnostics", () => {
  it("should count matching parentheses", () => {
    const count = expr => countMatchingParentheses(tokenize(expr).tokens);
    expect(count("()")).toEqual(0);
    expect(count("(")).toEqual(1);
    expect(count(")")).toEqual(-1);
    expect(count("(A+(")).toEqual(2);
    expect(count("SUMIF(")).toEqual(1);
    expect(count("COUNTIF(Deal))")).toEqual(-1);
  });

  it("should catch mismatched parentheses", () => {
    expect(diagnose({ source: "FLOOR [Price]/2)" }).message).toEqual(
      "Expecting an opening parenthesis after function FLOOR",
    );
  });

  it("should catch missing parentheses", () => {
    expect(diagnose({ source: "LOWER [Vendor]" }).message).toEqual(
      "Expecting an opening parenthesis after function LOWER",
    );
  });

  it("should catch invalid characters", () => {
    expect(diagnose({ source: "[Price] / #" }).message).toEqual(
      "Invalid character: #",
    );
  });

  it("should catch unterminated string literals", () => {
    expect(diagnose({ source: '[Category] = "widget' }).message).toEqual(
      "Missing closing quotes",
    );
  });

  it("should catch unterminated field reference", () => {
    expect(diagnose({ source: "[Price / 2" }).message).toEqual(
      "Missing a closing bracket",
    );
  });

  it("should show the correct number of CASE arguments in a custom expression", () => {
    expect(diagnose({ source: "CASE([Price]>0)" }).message).toEqual(
      "CASE expects 2 arguments or more",
    );
  });

  it("should show the correct number of function arguments in a custom expression", () => {
    expect(
      diagnose({ source: "between([Tax])", startRule: "boolean" }).message,
    ).toEqual("Function between expects 3 arguments");
  });
});
