import {
  AND,
  CLOSE,
  OPEN,
  OR,
  TEST_ADAPTER,
  and,
  leaf,
  or,
  pill,
} from "../test-utils";
import type { FilterStages } from "../types";

import type { ParseErrorCode, TokenStages } from "./tokens";
import { normalizeTokens, tokensToTrees } from "./tokens-to-tree";
import { treesToTokens } from "./tree-to-tokens";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");

describe("tokensToTrees", () => {
  it.each<[string, TokenStages<string>, FilterStages<string>]>([
    ["nothing", [], []],
    ["one pill", [[A]], [leaf("A")]],
    ["and", [[A, AND, B]], [and(leaf("A"), leaf("B"))]],
    ["or", [[A, OR, B]], [or(leaf("A"), leaf("B"))]],
    [
      "a chain of ors as one flat or",
      [[A, OR, B, OR, C]],
      [or(leaf("A"), leaf("B"), leaf("C"))],
    ],
    [
      "pills side by side without an or as and",
      [[A, B, OPEN, C, CLOSE]],
      [and(leaf("A"), leaf("B"), leaf("C"))],
    ],
    [
      "pills side by side as and next to an or",
      [[A, B, OR, C]],
      [or(and(leaf("A"), leaf("B")), leaf("C"))],
    ],
    [
      "a pill and a group side by side as and",
      [[A, OPEN, B, OR, C, CLOSE]],
      [and(leaf("A"), or(leaf("B"), leaf("C")))],
    ],
    [
      "and binds tighter than or",
      [[A, AND, B, OR, C]],
      [or(and(leaf("A"), leaf("B")), leaf("C"))],
    ],
    [
      "and binds tighter than or, and on the right",
      [[A, OR, B, AND, C]],
      [or(leaf("A"), and(leaf("B"), leaf("C")))],
    ],
    [
      "parentheses",
      [[A, AND, OPEN, B, OR, C, CLOSE]],
      [and(leaf("A"), or(leaf("B"), leaf("C")))],
    ],
    [
      "parentheses first",
      [[OPEN, A, OR, B, CLOSE, AND, C]],
      [and(or(leaf("A"), leaf("B")), leaf("C"))],
    ],
    [
      "parentheses around one pill",
      [[OPEN, OPEN, A, CLOSE, CLOSE]],
      [leaf("A")],
    ],
    [
      "the same connective in parentheses is flattened",
      [[A, AND, OPEN, B, AND, C, CLOSE]],
      [and(leaf("A"), leaf("B"), leaf("C"))],
    ],
    [
      "each stage on its own",
      [
        [A, OR, B],
        [C, D],
      ],
      [or(leaf("A"), leaf("B")), and(leaf("C"), leaf("D"))],
    ],
    ["no row filters", [[], [C]], [and(), leaf("C")]],
  ])("parses %s", (_, stages, expected) => {
    expect(tokensToTrees(stages)).toEqual({ type: "ok", stages: expected });
  });

  it.each<[string, TokenStages<string>, ParseErrorCode, number, number[]]>([
    ["and at the end", [[A, AND]], "missing-operand", 0, [1]],
    ["an open parenthesis at the end", [[A, OPEN]], "missing-operand", 0, [1]],
    ["or at the start", [[OR, A]], "missing-operand", 0, [0]],
    ["two bool ops in a row", [[A, AND, OR, B]], "missing-operand", 0, [2]],
    [
      "a bool op before a close parenthesis",
      [[OPEN, A, AND, CLOSE]],
      "missing-operand",
      0,
      [2],
    ],
    ["empty parentheses", [[OPEN, CLOSE]], "empty-parentheses", 0, [0, 1]],
    [
      "empty parentheses inside parentheses",
      [[OPEN, OPEN, CLOSE, CLOSE]],
      "empty-parentheses",
      0,
      [1, 2],
    ],
    [
      "two open parentheses without pairs",
      [[OPEN, OPEN, A]],
      "missing-closing-parenthesis",
      0,
      [0],
    ],
    [
      "a close parenthesis after a pair",
      [[OPEN, A, CLOSE, CLOSE]],
      "unexpected-closing-parenthesis",
      0,
      [3],
    ],
    [
      "a close parenthesis before a pair",
      [[CLOSE, OPEN, A, CLOSE]],
      "unexpected-closing-parenthesis",
      0,
      [0],
    ],
    [
      "a group that crosses stages",
      [
        [OPEN, A],
        [B, CLOSE],
      ],
      "missing-closing-parenthesis",
      0,
      [0],
    ],
    ["an error in a later stage", [[A], [B, AND]], "missing-operand", 1, [1]],
    [
      "only the first error of two stages",
      [
        [A, OR],
        [B, AND],
      ],
      "missing-operand",
      0,
      [1],
    ],
  ])("reports %s", (_, stages, code, stageIndex, indexes) => {
    expect(tokensToTrees(stages)).toEqual({
      type: "error",
      code,
      stageIndex,
      indexes,
    });
  });

  it.each<[string, FilterStages<string>]>([
    ["two stages", [and(leaf("A"), or(leaf("B"), leaf("C"))), leaf("D")]],
    ["hidden ands", [and(leaf("A"), leaf("B"), leaf("C"))]],
  ])("reads back the tokens of stages: %s", (_, stages) => {
    expect(tokensToTrees(treesToTokens(stages, TEST_ADAPTER))).toEqual({
      type: "ok",
      stages,
    });
  });
});

describe("normalizeTokens", () => {
  it.each<[string, TokenStages<string>, TokenStages<string>]>([
    ["nothing", [], []],
    [
      "a valid expression stays as it is",
      [[A, AND, OPEN, B, OR, C, CLOSE], [D]],
      [[A, AND, OPEN, B, OR, C, CLOSE], [D]],
    ],
    ["drops or at the end", [[A, OR]], [[A]]],
    ["keeps the first of two bool ops", [[A, OR, AND, B]], [[A, OR, B]]],
    [
      "drops bool ops next to parentheses",
      [[OPEN, AND, A, OR, CLOSE]],
      [[OPEN, A, CLOSE]],
    ],
    [
      "drops empty parentheses and the bool op left behind",
      [[A, OR, OPEN, CLOSE, AND, B]],
      [[A, OR, B]],
    ],
    ["drops nested empty parentheses", [[OPEN, OPEN, CLOSE, CLOSE]], [[]]],
    ["drops an open parenthesis at the end", [[A, AND, OPEN]], [[A]]],
    ["drops a bool op at the end of a stage", [[A, OR], [B]], [[A], [B]]],
    ["drops a bool op in a later stage", [[A], [B, OR]], [[A], [B]]],
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
      expect(tokensToTrees(stages)).toMatchObject({
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
