import {
  AND,
  CLOSE,
  OPEN,
  OR,
  TEST_ADAPTER,
  and,
  createTestPill,
  leaf,
  or,
  pill,
} from "../test-utils";
import type { FilterBarAdapter, FilterStages } from "../types";

import { stagesToTokens } from "./stages-to-tokens";
import type { TokenStages } from "./types";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");
const E = pill("E");

describe("stagesToTokens", () => {
  it.each<[string, FilterStages<string>, TokenStages<string>]>([
    ["no filters", [], []],
    ["one filter", [leaf("A")], [[A]]],
    [
      "or inside and gets parentheses",
      [and(leaf("A"), or(leaf("B"), leaf("C")))],
      [[A, AND, OPEN, B, OR, C, CLOSE]],
    ],
    [
      "and inside or needs no parentheses",
      [or(and(leaf("A"), leaf("B")), leaf("C"))],
      [[A, AND, B, OR, C]],
    ],
    [
      "nested groups",
      [and(leaf("A"), or(leaf("B"), and(leaf("C"), or(leaf("D"), leaf("E")))))],
      [[A, AND, OPEN, B, OR, C, AND, OPEN, D, OR, E, CLOSE, CLOSE]],
    ],
    [
      "ands are hidden while the stage has no or",
      [and(leaf("A"), leaf("B"), leaf("C"))],
      [[A, B, C]],
    ],
    [
      "the same connective nested needs no parentheses",
      [or(leaf("A"), or(leaf("B"), leaf("C")))],
      [[A, OR, B, OR, C]],
    ],
    ["a group of one is unwrapped", [and(or(leaf("A")))], [[A]]],
    [
      "a group of one keeps the parentheses its child needs",
      [and(leaf("A"), or(or(leaf("B"), leaf("C"))))],
      [[A, AND, OPEN, B, OR, C, CLOSE]],
    ],
    ["empty groups are skipped", [and(leaf("A"), or(), and(or()))], [[A]]],
    [
      "each stage on its own",
      [or(leaf("A"), leaf("B")), leaf("C")],
      [[A, OR, B], [C]],
    ],
    ["no row filters", [and(), leaf("C")], [[], [C]]],
    [
      "a filter on the second summary only",
      [and(), and(), leaf("C")],
      [[], [], [C]],
    ],
    [
      "empty stages are kept, so the caret can get into them",
      [leaf("A"), and(), and()],
      [[A], [], []],
    ],
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
      [{ type: "pill", filter: "A", content: createTestPill("A@0") }],
      [],
      [{ type: "pill", filter: "C", content: createTestPill("C@2") }],
    ]);
  });

  it("gives each connector its own object, so it can be a React key", () => {
    const [tokens] = stagesToTokens(
      [or(and(leaf("A"), leaf("B")), and(leaf("C"), leaf("D")))],
      TEST_ADAPTER,
    );
    expect(tokens[1]).not.toBe(tokens[5]);
  });
});
