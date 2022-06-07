import { tokenize } from "metabase/lib/expressions/tokenizer";
import {
  countMatchingParentheses,
  diagnose,
} from "metabase/lib/expressions/diagnostics";

describe("metabase/lib/expressions/diagnostics", () => {
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
    expect(diagnose("FLOOR [Price]/2)").message).toEqual(
      "Expecting an opening parenthesis after function FLOOR",
    );
  });

  it("should catch missing parentheses", () => {
    expect(diagnose("LOWER [Vendor]").message).toEqual(
      "Expecting an opening parenthesis after function LOWER",
    );
  });

  it("should catch invalid characters", () => {
    expect(diagnose("[Price] / #").message).toEqual("Invalid character: #");
  });

  it("should catch unterminated string literals", () => {
    expect(diagnose('[Category] = "widget').message).toEqual(
      "Missing closing quotes",
    );
  });

  it("should catch unterminated field reference", () => {
    expect(diagnose("[Price / 2").message).toEqual("Missing a closing bracket");
  });

  it("should show the correct number of CASE arguments in a custom expression", () => {
    expect(diagnose("CASE([Price]>0)").message).toEqual(
      "CASE expects 2 arguments or more",
    );
  });

  it("should show the correct number of function arguments in a custom expression", () => {
    expect(diagnose("contains([Category])", "boolean").message).toEqual(
      "Function contains expects 2 arguments",
    );
  });

  it("should show an error for custom columns with a root boolean expression", () => {
    expect(diagnose("[Canceled] = [Returned]", "expression").message).toEqual(
      "Custom columns do not support boolean expressions",
    );
  });
});
