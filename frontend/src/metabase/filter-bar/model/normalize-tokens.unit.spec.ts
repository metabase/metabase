import { AND, CLOSE, OPEN, OR, THEN, pill } from "../test-utils";

import { normalizeTokens } from "./normalize-tokens";
import { parseTokens } from "./parse-tokens";
import type { Token } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");

describe("normalizeTokens", () => {
  it.each<[string, Token<string>[], Token<string>[]]>([
    ["nothing", [], []],
    [
      "a valid expression stays as it is",
      [A, AND, OPEN, B, OR, C, CLOSE, THEN, D],
      [A, AND, OPEN, B, OR, C, CLOSE, THEN, D],
    ],
    ["adds and between pills", [A, B], [A, AND, B]],
    [
      "adds and around a group",
      [A, OPEN, B, OR, C, CLOSE, D],
      [A, AND, OPEN, B, OR, C, CLOSE, AND, D],
    ],
    ["drops and at the end", [A, AND], [A]],
    ["keeps the first of two connectors", [A, AND, OR, B], [A, AND, B]],
    [
      "drops connectors next to parentheses",
      [OPEN, AND, A, OR, CLOSE],
      [OPEN, A, CLOSE],
    ],
    ["drops empty parentheses", [A, AND, OPEN, CLOSE], [A]],
    [
      "drops empty parentheses and the connector left behind",
      [A, AND, OPEN, CLOSE, OR, B],
      [A, AND, B],
    ],
    ["drops nested empty parentheses", [OPEN, OPEN, CLOSE, CLOSE], []],
    ["drops an open parenthesis at the end", [A, AND, OPEN], [A]],
    ["drops a connector before then", [A, AND, THEN, B], [A, THEN, B]],
    ["drops a connector in a later stage", [A, THEN, B, AND], [A, THEN, B]],
    ["drops trailing empty stages", [A, THEN, THEN], [A]],
    ["keeps a leading then", [THEN, C], [THEN, C]],
    ["keeps an empty stage between", [A, THEN, THEN, C], [A, THEN, THEN, C]],
    ["drops a lone then", [THEN], []],
  ])("%s", (_, tokens, expected) => {
    expect(normalizeTokens(tokens)).toEqual(expected);
  });

  it("stops at a stray close parenthesis and leaves the rest as it is", () => {
    expect(normalizeTokens([A, CLOSE, AND])).toEqual([A, CLOSE, AND]);
  });

  it("keeps a stray close parenthesis, so the expression stays broken", () => {
    const tokens = normalizeTokens([A, CLOSE]);

    expect(tokens).toEqual([A, CLOSE]);
    expect(parseTokens(tokens)).toEqual({
      type: "error",
      code: "unexpected-closing-parenthesis",
      indexes: [1],
    });
  });

  describe("missing close parenthesis", () => {
    it.each<[string, Token<string>[], Token<string>[]]>([
      [
        "only and inside",
        [A, AND, OPEN, B, AND, C],
        [A, AND, OPEN, B, AND, C, CLOSE],
      ],
      [
        "only or inside at the start",
        [OPEN, A, OR, B],
        [OPEN, A, OR, B, CLOSE],
      ],
      [
        "only or inside after or",
        [A, OR, OPEN, B, OR, C],
        [A, OR, OPEN, B, OR, C, CLOSE],
      ],
      ["several groups", [OPEN, OPEN, A], [OPEN, OPEN, A, CLOSE, CLOSE]],
      [
        "or and and inside, but or only in a closed inner group",
        [OPEN, A, AND, OPEN, B, OR, C, CLOSE, AND, D],
        [OPEN, A, AND, OPEN, B, OR, C, CLOSE, AND, D, CLOSE],
      ],
      ["a group before then", [OPEN, A, THEN, B], [OPEN, A, CLOSE, THEN, B]],
    ])("is added when there is one reading: %s", (_, tokens, expected) => {
      expect(normalizeTokens(tokens)).toEqual(expected);
    });

    it.each<[string, Token<string>[]]>([
      [
        "or inside after and: A and (B or C), (A and B) or C",
        [A, AND, OPEN, B, OR, C],
      ],
      [
        "or and and inside: (A or B and C), (A or B) and C",
        [OPEN, A, OR, B, AND, C],
      ],
      [
        "an inner group with or inside after and",
        [OPEN, A, AND, OPEN, B, OR, C],
      ],
    ])("is not added when there are two readings: %s", (_, tokens) => {
      expect(normalizeTokens(tokens)).toEqual(tokens);
      expect(parseTokens(tokens)).toMatchObject({
        code: "missing-closing-parenthesis",
      });
    });
  });
});
