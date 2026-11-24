import {
  AND,
  CLOSE,
  OPEN,
  OR,
  TEST_ADAPTER,
  THEN_1,
  THEN_2,
  and,
  createTestPill,
  leaf,
  or,
  pill,
} from "../test-utils";
import type { FilterBarAdapter, FilterStages } from "../types";

import { stagesToTokens } from "./stages-to-tokens";
import type { Token } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");
const E = pill("E");

describe("stagesToTokens", () => {
  it.each<[string, FilterStages<string>, Token<string>[]]>([
    ["no filters", [], []],
    ["one filter", [leaf("A")], [A]],
    [
      "or inside and gets parentheses",
      [and(leaf("A"), or(leaf("B"), leaf("C")))],
      [A, AND, OPEN, B, OR, C, CLOSE],
    ],
    [
      "and inside or needs no parentheses",
      [or(and(leaf("A"), leaf("B")), leaf("C"))],
      [A, AND, B, OR, C],
    ],
    [
      "nested groups",
      [and(leaf("A"), or(leaf("B"), and(leaf("C"), or(leaf("D"), leaf("E")))))],
      [A, AND, OPEN, B, OR, C, AND, OPEN, D, OR, E, CLOSE, CLOSE],
    ],
    [
      "the same connective nested needs no parentheses",
      [and(leaf("A"), and(leaf("B"), leaf("C")))],
      [A, AND, B, AND, C],
    ],
    ["a group of one is unwrapped", [and(or(leaf("A")))], [A]],
    [
      "a group of one keeps the parentheses its child needs",
      [and(leaf("A"), or(or(leaf("B"), leaf("C"))))],
      [A, AND, OPEN, B, OR, C, CLOSE],
    ],
    ["empty groups are skipped", [and(leaf("A"), or(), and(or()))], [A]],
    [
      "then splits the whole expression",
      [or(leaf("A"), leaf("B")), leaf("C")],
      [A, OR, B, THEN_1, C],
    ],
    ["no row filters", [and(), leaf("C")], [THEN_1, C]],
    [
      "a filter on the second summary only",
      [and(), and(), leaf("C")],
      [THEN_2, C],
    ],
    ["trailing empty stages are dropped", [leaf("A"), and(), and()], [A]],
  ])("%s", (_, stages, expected) => {
    expect(stagesToTokens(stages, TEST_ADAPTER)).toEqual(expected);
  });

  it("builds each pill with the adapter of its stage", () => {
    const adapter: FilterBarAdapter<string> = {
      ...TEST_ADAPTER,
      stage: (index) => ({
        ...TEST_ADAPTER.stage(index),
        toPill: (filter) => createTestPill(`${filter}@${index}`),
      }),
    };

    const stages: FilterStages<string> = [leaf("A"), and(), leaf("C")];

    const tokens = stagesToTokens(stages, adapter);

    expect(tokens).toEqual([
      { type: "pill", filter: "A", content: createTestPill("A@0") },
      THEN_2,
      { type: "pill", filter: "C", content: createTestPill("C@2") },
    ]);
  });
});
