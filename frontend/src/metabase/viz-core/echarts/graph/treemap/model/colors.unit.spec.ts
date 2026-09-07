import { color } from "metabase/ui/colors";
import type { TreemapRow } from "metabase-types/api";

import { getTreemapColors } from "./colors";
import type { TreemapTree } from "./types";

const TREE: TreemapTree = [
  { rawName: "Doohickey", displayName: "Doohickey", value: 1, rowIndices: [0] },
];

const createRow = (row: Partial<TreemapRow>): TreemapRow => ({
  key: "Doohickey",
  name: "Doohickey",
  originalName: "Doohickey",
  color: "#000000",
  defaultColor: false,
  enabled: true,
  hidden: false,
  ...row,
});

describe("getTreemapColors", () => {
  it("uses the palette color a group records over its stored color", () => {
    const colors = getTreemapColors(TREE, [
      createRow({ color_name: "accent3" }),
    ]);

    expect(colors.Doohickey).toBe(color("accent3"));
  });

  it("keeps the stored color of a group that records no palette color", () => {
    const colors = getTreemapColors(TREE, [createRow({ color: "#123456" })]);

    expect(colors.Doohickey).toBe("#123456");
  });
});
