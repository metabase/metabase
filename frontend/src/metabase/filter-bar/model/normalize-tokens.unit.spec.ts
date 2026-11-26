import { AND, CLOSE, OPEN, OR, pill } from "../test-utils";

import { normalizeTokens } from "./normalize-tokens";
import { parseTokens } from "./parse-tokens";
import type { TokenStages } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");

describe("normalizeTokens", () => {
  it.each<[string, TokenStages<string>, TokenStages<string>]>([
    ["nothing", [], []],
    [
      "a valid expression stays as it is",
      [[A, AND, OPEN, B, OR, C, CLOSE], [D]],
      [[A, AND, OPEN, B, OR, C, CLOSE], [D]],
    ],
    ["drops or at the end", [[A, OR]], [[A]]],
    ["keeps the first of two connectors", [[A, OR, AND, B]], [[A, OR, B]]],
    [
      "drops connectors next to parentheses",
      [[OPEN, AND, A, OR, CLOSE]],
      [[OPEN, A, CLOSE]],
    ],
    [
      "drops empty parentheses and the connector left behind",
      [[A, OR, OPEN, CLOSE, AND, B]],
      [[A, OR, B]],
    ],
    ["drops nested empty parentheses", [[OPEN, OPEN, CLOSE, CLOSE]], [[]]],
    ["drops an open parenthesis at the end", [[A, AND, OPEN]], [[A]]],
    ["drops a connector at the end of a stage", [[A, OR], [B]], [[A], [B]]],
    ["drops a connector in a later stage", [[A], [B, OR]], [[A], [B]]],
    ["keeps empty stages", [[A], [], []], [[A], [], []]],
    [
      "fixes one error after another, in every stage",
      [
        [A, AND, OPEN],
        [B, OR],
      ],
      [[A], [B]],
    ],
    [
      "hides the ands once a fix drops the last or",
      [[A, AND, B, OR]],
      [[A, B]],
    ],
  ])("%s", (_, stages, expected) => {
    expect(normalizeTokens(stages)).toEqual(expected);
  });

  it("stops at a stray close parenthesis and leaves the rest as it is", () => {
    expect(normalizeTokens([[A, CLOSE, OR]])).toEqual([[A, CLOSE, OR]]);
  });

  describe("missing close parenthesis", () => {
    it.each<[string, TokenStages<string>, TokenStages<string>]>([
      [
        "only and inside",
        [[A, AND, OPEN, B, AND, C]],
        [[A, OPEN, B, C, CLOSE]],
      ],
      [
        "only or inside at the start",
        [[OPEN, A, OR, B]],
        [[OPEN, A, OR, B, CLOSE]],
      ],
      [
        "only or inside after or",
        [[A, OR, OPEN, B, OR, C]],
        [[A, OR, OPEN, B, OR, C, CLOSE]],
      ],
      ["several groups", [[OPEN, OPEN, A]], [[OPEN, OPEN, A, CLOSE, CLOSE]]],
      [
        "or and and inside, but or only in a closed inner group",
        [[OPEN, A, AND, OPEN, B, OR, C, CLOSE, AND, D]],
        [[OPEN, A, AND, OPEN, B, OR, C, CLOSE, AND, D, CLOSE]],
      ],
      [
        "and before a closed inner group with or",
        [[OPEN, A, AND, OPEN, B, OR, C, CLOSE]],
        [[OPEN, A, AND, OPEN, B, OR, C, CLOSE, CLOSE]],
      ],
      [
        "a group at the end of a stage",
        [[OPEN, A], [B]],
        [[OPEN, A, CLOSE], [B]],
      ],
    ])("is added when there is one reading: %s", (_, stages, expected) => {
      expect(normalizeTokens(stages)).toEqual(expected);
    });

    it.each<[string, TokenStages<string>]>([
      [
        "or inside after and: A and (B or C), (A and B) or C",
        [[A, AND, OPEN, B, OR, C]],
      ],
      [
        "or and and inside: (A or B and C), (A or B) and C",
        [[OPEN, A, OR, B, AND, C]],
      ],
      [
        "an inner group with or inside after and",
        [[OPEN, A, AND, OPEN, B, OR, C]],
      ],
    ])("is not added when there are two readings: %s", (_, stages) => {
      expect(normalizeTokens(stages)).toEqual(stages);
      expect(parseTokens(stages)).toMatchObject({
        code: "missing-closing-parenthesis",
      });
    });

    it("is not added after an implicit and, which is written out first", () => {
      expect(normalizeTokens([[A, OPEN, B, OR, C]])).toEqual([
        [A, AND, OPEN, B, OR, C],
      ]);
    });
  });
});
