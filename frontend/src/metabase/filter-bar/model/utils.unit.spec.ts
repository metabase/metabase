import { AND, OR, and, createTestPill, leaf, or, pill } from "../test-utils";
import type { FilterTree } from "../types";

import type { TokenStages } from "./types";
import { isEmptyTree, isSameStages, pillToken } from "./utils";

const A = pill("A");
const B = pill("B");

describe("isSameStages", () => {
  it("treats pills that look the same as the same, even with different filters", () => {
    const before = [[pillToken({ id: 1 }, createTestPill("A"))]];
    const after = [[pillToken({ id: 2 }, createTestPill("A"))]];
    expect(isSameStages(before, after)).toBe(true);
  });

  it("tells pills that look different apart", () => {
    const before = [[pillToken("A", createTestPill("A"))]];
    const after = [[pillToken("A", createTestPill("B"))]];
    expect(isSameStages(before, after)).toBe(false);
  });

  it.each<[string, TokenStages<string>, TokenStages<string>]>([
    ["no stages and one empty stage", [], [[]]],
    ["a stage and the same stage with an empty one after it", [[A]], [[A], []]],
  ])("treats as the same %s", (_, before, after) => {
    expect(isSameStages(before, after)).toBe(true);
  });

  it.each<[string, TokenStages<string>, TokenStages<string>]>([
    ["a different stage count", [[A]], [[A], [B]]],
    ["a different token count", [[A, B]], [[A]]],
    ["and and or", [[A, AND, B]], [[A, OR, B]]],
    ["a pill and an and", [[A, B]], [[A, AND]]],
  ])("tells apart %s", (_, before, after) => {
    expect(isSameStages(before, after)).toBe(false);
  });
});

describe("isEmptyTree", () => {
  it.each<[string, FilterTree<string>, boolean]>([
    ["an empty group", and(), true],
    ["nested empty groups", and(or(), and(or())), true],
    ["a leaf", leaf("A"), false],
    ["a group with a leaf deep inside", and(or(), and(leaf("A"))), false],
  ])("%s", (_, tree, expected) => {
    expect(isEmptyTree(tree)).toBe(expected);
  });
});
