import { AND, CLOSE, OPEN, OR, createTestPill, pill } from "../test-utils";

import {
  type TokenStages,
  applyImplicitAnds,
  isSameStages,
  pillToken,
} from "./tokens";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");

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

describe("applyImplicitAnds", () => {
  it("hides ands while the stage has no or", () => {
    expect(applyImplicitAnds([[A, AND, B, AND, C]])).toEqual([[A, B, C]]);
  });

  it("writes out ands where operands touch once the stage has an or", () => {
    expect(applyImplicitAnds([[A, B, OR, C, OPEN, D, OR, A, CLOSE]])).toEqual([
      [A, AND, B, OR, C, AND, OPEN, D, OR, A, CLOSE],
    ]);
  });

  it.each([
    [
      "a close parenthesis and a pill",
      [OPEN, A, OR, B, CLOSE, C],
      [OPEN, A, OR, B, CLOSE, AND, C],
    ],
    [
      "two groups",
      [OPEN, A, OR, B, CLOSE, OPEN, C, OR, D, CLOSE],
      [OPEN, A, OR, B, CLOSE, AND, OPEN, C, OR, D, CLOSE],
    ],
  ])("writes out an and between %s", (_, tokens, expected) => {
    expect(applyImplicitAnds([tokens])).toEqual([expected]);
  });

  it("decides for each stage on its own", () => {
    expect(
      applyImplicitAnds([
        [A, B, OR, C],
        [D, AND, B],
      ]),
    ).toEqual([
      [A, AND, B, OR, C],
      [D, B],
    ]);
  });

  it("keeps the tokens that are already right", () => {
    const stages = [[A, AND, B, OR, C], [D]];
    const [rows, summary] = applyImplicitAnds(stages);
    expect(rows).toHaveLength(stages[0].length);
    expect(rows.every((token, index) => token === stages[0][index])).toBe(true);
    expect(summary[0]).toBe(D);
  });
});
