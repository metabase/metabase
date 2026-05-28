import { getTreemapColors } from "./colors";
import type { TreemapTree } from "./types";

describe("getTreemapColors", () => {
  it("maps each top-level node (by stringified rawName) to a color", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
    ];

    const colors = getTreemapColors(tree);

    expect(Object.keys(colors).sort()).toEqual(["A", "B"]);
    expect(typeof colors["A"]).toBe("string");
    expect(colors["A"]).toBeTruthy();
    expect(typeof colors["B"]).toBe("string");
    expect(colors["B"]).toBeTruthy();
  });

  it("assigns distinct colors to distinct groupings", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      { rawName: "C", displayName: "C", value: 7, rowIndices: [2] },
    ];

    const colors = getTreemapColors(tree);

    const used = [colors["A"], colors["B"], colors["C"]];
    expect(new Set(used).size).toBe(3);
  });

  it("is stable: same input produces the same mapping", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
    ];

    expect(getTreemapColors(tree)).toEqual(getTreemapColors(tree));
  });

  it("keys only top-level groupings, not sub-grouping children", () => {
    const tree: TreemapTree = [
      {
        rawName: "Europe",
        displayName: "Europe",
        value: 30,
        rowIndices: [0, 1],
        children: [
          {
            rawName: "Sweden",
            displayName: "Sweden",
            value: 20,
            rowIndices: [0],
          },
          {
            rawName: "Germany",
            displayName: "Germany",
            value: 10,
            rowIndices: [1],
          },
        ],
      },
    ];

    const colors = getTreemapColors(tree);

    expect(Object.keys(colors)).toEqual(["Europe"]);
    expect(colors).not.toHaveProperty("Sweden");
    expect(colors).not.toHaveProperty("Germany");
  });

  it("stringifies non-string rawNames into keys", () => {
    const tree: TreemapTree = [
      { rawName: 2024, displayName: "2024", value: 10, rowIndices: [0] },
      { rawName: null, displayName: "", value: 5, rowIndices: [1] },
    ];

    const colors = getTreemapColors(tree);

    expect(colors).toHaveProperty("2024");
    expect(colors).toHaveProperty("null");
  });

  it("returns an empty mapping for an empty tree", () => {
    expect(getTreemapColors([])).toEqual({});
  });
});
