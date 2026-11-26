import { AND, CLOSE, OPEN, OR, pill } from "../test-utils";

import { applyImplicitAnds } from "./implicit-and";

const A = pill("A");
const B = pill("B");
const C = pill("C");
const D = pill("D");

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
