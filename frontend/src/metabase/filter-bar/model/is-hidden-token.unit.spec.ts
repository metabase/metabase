import { AND, CLOSE, OPEN, OR, THEN_1, THEN_2, pill } from "../test-utils";

import { isHiddenToken } from "./is-hidden-token";
import type { Token } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");

const hiddenIndexes = (tokens: Token<string>[]) =>
  tokens.flatMap((_, index) => (isHiddenToken(tokens, index) ? [index] : []));

describe("isHiddenToken", () => {
  it("hides and while the expression has no or", () => {
    expect(hiddenIndexes([A, AND, B])).toEqual([1]);
  });

  it("shows and once the expression has an or", () => {
    expect(hiddenIndexes([A, AND, OPEN, B, OR, C, CLOSE])).toEqual([]);
  });

  it("hides then before the first pill", () => {
    expect(hiddenIndexes([THEN_2, C])).toEqual([0]);
  });

  it("shows then after a pill", () => {
    expect(hiddenIndexes([A, THEN_1, C])).toEqual([]);
  });
});
