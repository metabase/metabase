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

import { parseTokens } from "./parse-tokens";
import { stagesToTokens } from "./stages-to-tokens";
import type { ParseErrorCode, TokenStages } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");

describe("parseTokens", () => {
  it.each<[string, TokenStages<string>, FilterStages<string>]>([
    ["nothing", [], []],
    ["one pill", [[A]], [leaf("A")]],
    ["and", [[A, AND, B]], [and(leaf("A"), leaf("B"))]],
    ["or", [[A, OR, B]], [or(leaf("A"), leaf("B"))]],
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
    [
      "a filter on the second summary only",
      [[], [], [C]],
      [and(), and(), leaf("C")],
    ],
    ["an empty last stage", [[A], []], [leaf("A"), and()]],
  ])("parses %s", (_, stages, expected) => {
    expect(parseTokens(stages)).toEqual({ type: "ok", stages: expected });
  });

  it.each<[string, TokenStages<string>, ParseErrorCode, number, number[]]>([
    ["and at the end", [[A, AND]], "missing-operand", 0, [1]],
    ["or at the start", [[OR, A]], "missing-operand", 0, [0]],
    ["two connectors in a row", [[A, AND, OR, B]], "missing-operand", 0, [2]],
    [
      "a connector before a close parenthesis",
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
  ])("reports %s", (_, stages, code, stage, indexes) => {
    expect(parseTokens(stages)).toEqual({
      type: "error",
      code,
      stage,
      indexes,
    });
  });

  it.each<[string, FilterStages<string>]>([
    ["and inside or", [or(and(leaf("A"), leaf("B")), leaf("C"))]],
    [
      "nested groups",
      [and(leaf("A"), or(leaf("B"), and(leaf("C"), or(leaf("D"), leaf("E")))))],
    ],
    ["two stages", [and(leaf("A"), or(leaf("B"), leaf("C"))), leaf("D")]],
    ["an empty stage between", [leaf("A"), and(), leaf("C")]],
  ])("reads back the tokens of stages: %s", (_, stages) => {
    expect(parseTokens(stagesToTokens(stages, TEST_ADAPTER))).toEqual({
      type: "ok",
      stages,
    });
  });
});
