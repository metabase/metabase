import { hasCyclicFlow } from "./cycle-detection";

describe("hasCyclicFlow", () => {
  it.each([
    [
      [
        ["A", "B"],
        ["B", "C"],
        ["C", "A"],
      ],
    ],
    [
      // Cycle B -> C -> D -> B
      [
        ["A", "B"],
        ["B", "C"],
        ["C", "D"],
        ["D", "B"],
        ["A", "E"],
      ],
    ],
    [
      [
        ["A", "A"],
        ["B", "C"],
      ],
    ],
  ])("should detect a cycle in the flow", rows => {
    expect(hasCyclicFlow(rows, 0, 1)).toBe(true);
  });

  it("should return false for acyclic flow", () => {
    const rows = [
      ["A", "B"],
      ["B", "C"],
      ["A", "C"],
    ];

    expect(hasCyclicFlow(rows, 0, 1)).toBe(false);
  });

  it("should return false for empty flow", () => {
    const rows: string[][] = [];

    expect(hasCyclicFlow(rows, 0, 1)).toBe(false);
  });
});
