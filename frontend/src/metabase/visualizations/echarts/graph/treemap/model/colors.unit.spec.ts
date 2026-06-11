import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";

import { getTreemapColors } from "./colors";
import type { TreemapTree } from "./types";

function makeTree(names: (string | null)[]): TreemapTree {
  return names.map((name) => ({
    rawName: name,
    displayName: name ?? NULL_DISPLAY_VALUE,
    value: 10,
    rowIndices: [],
  }));
}

describe("getTreemapColors", () => {
  it("assigns a palette color per top-level node, keyed by settings key", () => {
    const colors = getTreemapColors(makeTree(["Phones", "Laptops"]));

    expect(Object.keys(colors).sort()).toEqual(["Laptops", "Phones"]);
    expect(colors.Phones).toMatch(/^#/);
    expect(colors.Phones).not.toBe(colors.Laptops);
  });

  it("uses colors from treemap.rows when provided", () => {
    const tree = makeTree(["Phones", "Laptops"]);
    const colors = getTreemapColors(tree, [
      {
        key: "Phones",
        name: "Phones",
        originalName: "Phones",
        color: "#FF0000",
        defaultColor: false,
        hidden: false,
      },
    ]);

    expect(colors.Phones).toBe("#FF0000");
    expect(colors.Laptops).toMatch(/^#/);
  });
});
