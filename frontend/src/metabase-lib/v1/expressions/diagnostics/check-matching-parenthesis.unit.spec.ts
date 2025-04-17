import { lexify } from "../pratt";

import { countMatchingParentheses } from "./check-matching-parenthesis";

describe("checkMatchingParentheses", () => {
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
});
