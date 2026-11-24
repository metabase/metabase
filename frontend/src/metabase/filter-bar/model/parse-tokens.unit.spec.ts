import {
  AND,
  CLOSE,
  OPEN,
  OR,
  TEST_ADAPTER,
  THEN_1,
  THEN_2,
  and,
  leaf,
  or,
  pill,
} from "../test-utils";
import type { FilterStages } from "../types";

import { parseTokens } from "./parse-tokens";
import { stagesToTokens } from "./stages-to-tokens";
import type { ParseErrorCode, Token } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");

describe("parseTokens", () => {
  it.each<[string, Token<string>[], FilterStages<string>]>([
    ["nothing", [], []],
    ["one pill", [A], [leaf("A")]],
    ["and", [A, AND, B], [and(leaf("A"), leaf("B"))]],
    ["or", [A, OR, B], [or(leaf("A"), leaf("B"))]],
    [
      "and binds tighter than or",
      [A, AND, B, OR, C],
      [or(and(leaf("A"), leaf("B")), leaf("C"))],
    ],
    [
      "and binds tighter than or, and on the right",
      [A, OR, B, AND, C],
      [or(leaf("A"), and(leaf("B"), leaf("C")))],
    ],
    [
      "parentheses",
      [A, AND, OPEN, B, OR, C, CLOSE],
      [and(leaf("A"), or(leaf("B"), leaf("C")))],
    ],
    [
      "parentheses first",
      [OPEN, A, OR, B, CLOSE, AND, C],
      [and(or(leaf("A"), leaf("B")), leaf("C"))],
    ],
    ["parentheses around one pill", [OPEN, OPEN, A, CLOSE, CLOSE], [leaf("A")]],
    [
      "the same connective in parentheses is flattened",
      [A, AND, OPEN, B, AND, C, CLOSE],
      [and(leaf("A"), leaf("B"), leaf("C"))],
    ],
    [
      "then splits the whole expression",
      [A, OR, B, THEN_1, C],
      [or(leaf("A"), leaf("B")), leaf("C")],
    ],
    ["no row filters", [THEN_1, C], [and(), leaf("C")]],
    [
      "a filter on the second summary only",
      [THEN_2, C],
      [and(), and(), leaf("C")],
    ],
    ["a trailing then", [A, THEN_1], [leaf("A")]],
  ])("parses %s", (_, tokens, expected) => {
    expect(parseTokens(tokens)).toEqual({ type: "ok", stages: expected });
  });

  it.each<[string, Token<string>[], ParseErrorCode, number[]]>([
    ["and at the end", [A, AND], "missing-filter", [1]],
    ["or at the start", [OR, A], "missing-filter", [0]],
    ["two connectors in a row", [A, AND, OR, B], "missing-filter", [2]],
    [
      "a connector before a close parenthesis",
      [OPEN, A, AND, CLOSE],
      "missing-filter",
      [2],
    ],
    ["two pills without a connector", [A, B], "missing-connector", [0, 1]],
    [
      "a pill and a group without a connector",
      [A, OPEN, B, OR, C, CLOSE],
      "missing-connector",
      [0, 1],
    ],
    ["empty parentheses", [OPEN, CLOSE], "empty-parentheses", [0, 1]],
    [
      "empty parentheses inside parentheses",
      [OPEN, OPEN, CLOSE, CLOSE],
      "empty-parentheses",
      [1, 2],
    ],
    [
      "two open parentheses without pairs",
      [OPEN, OPEN, A],
      "missing-closing-parenthesis",
      [0],
    ],
    [
      "a close parenthesis after a pair",
      [OPEN, A, CLOSE, CLOSE],
      "unexpected-closing-parenthesis",
      [3],
    ],
    [
      "a close parenthesis before a pair",
      [CLOSE, OPEN, A, CLOSE],
      "unexpected-closing-parenthesis",
      [0],
    ],
    [
      "then inside parentheses",
      [OPEN, A, THEN_1, B, CLOSE],
      "missing-closing-parenthesis",
      [0],
    ],
    ["an error in a later stage", [A, THEN_1, B, AND], "missing-filter", [3]],
    [
      "only the first error of two stages",
      [A, OR, THEN_1, B, AND],
      "missing-filter",
      [1],
    ],
  ])("reports %s", (_, tokens, code, indexes) => {
    expect(parseTokens(tokens)).toEqual({ type: "error", code, indexes });
  });

  it.each<[string, FilterStages<string>]>([
    ["and inside or", [or(and(leaf("A"), leaf("B")), leaf("C"))]],
    [
      "nested groups",
      [and(leaf("A"), or(leaf("B"), and(leaf("C"), or(leaf("D"), leaf("E")))))],
    ],
    ["two stages", [and(leaf("A"), or(leaf("B"), leaf("C"))), leaf("D")]],
  ])("reads back the tokens of stages: %s", (_, stages) => {
    expect(parseTokens(stagesToTokens(stages, TEST_ADAPTER))).toEqual({
      type: "ok",
      stages,
    });
  });
});
