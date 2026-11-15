import {
  type TreemapInlineValueIds,
  getTreemapTooltipContext,
  isTreemapTooltipSuppressed,
} from "./tooltip";
import type { TreemapNode, TreemapTree } from "./types";

const leaf = (
  displayName: string,
  value: number,
  rowIndices: number[],
): TreemapNode => ({
  rawName: displayName,
  displayName,
  value,
  rowIndices,
});

const twoLevelTree: TreemapTree = [
  {
    rawName: "A",
    displayName: "Group A",
    value: 30,
    rowIndices: [0, 1],
    children: [leaf("Leaf A1", 20, [0]), leaf("Leaf A2", 10, [1])],
  },
  {
    rawName: "B",
    displayName: "Group B",
    value: 15,
    rowIndices: [2],
    children: [leaf("Leaf B1", 15, [2])],
  },
];

const singleLevelTree: TreemapTree = [
  leaf("Leaf X", 40, [0]),
  leaf("Leaf Y", 10, [1]),
];

describe("getTreemapTooltipContext", () => {
  it("shows the parent group's leaves when hovering a leaf at overview", () => {
    const context = getTreemapTooltipContext(
      twoLevelTree,
      "0-1",
      null,
      "Category",
    );

    expect(context).toEqual({
      header: "Group A",
      siblings: twoLevelTree[0].children,
      focusedNode: twoLevelTree[0].children?.[1],
      parentNode: twoLevelTree[0],
    });
  });

  it("shows all groups when hovering a group header at overview", () => {
    const context = getTreemapTooltipContext(
      twoLevelTree,
      "0",
      null,
      "Category",
    );

    expect(context).toEqual({
      header: "Category",
      siblings: twoLevelTree,
      focusedNode: twoLevelTree[0],
    });
    expect(context?.parentNode).toBeUndefined();
  });

  it("shows all root leaves when hovering a leaf in a single-level chart", () => {
    const context = getTreemapTooltipContext(
      singleLevelTree,
      "0",
      null,
      "Category",
    );

    expect(context).toEqual({
      header: "Category",
      siblings: singleLevelTree,
      focusedNode: singleLevelTree[0],
    });
  });

  it("shows the group's leaves when hovering a leaf in the drilled view", () => {
    const context = getTreemapTooltipContext(
      twoLevelTree,
      "0-0",
      "0",
      "Category",
    );

    expect(context).toEqual({
      header: "Group A",
      siblings: twoLevelTree[0].children,
      focusedNode: twoLevelTree[0].children?.[0],
      parentNode: twoLevelTree[0],
    });
  });
});

describe("isTreemapTooltipSuppressed", () => {
  const inlineIds = (
    fullLeafIds: string[],
    valuePercentHeaderIds: string[],
  ): TreemapInlineValueIds => ({
    fullLeafIds: new Set(fullLeafIds),
    valuePercentHeaderIds: new Set(valuePercentHeaderIds),
  });

  describe("two-level overview", () => {
    it("suppresses a leaf whose value is fully shown on the tile", () => {
      expect(
        isTreemapTooltipSuppressed("0-1", null, true, inlineIds(["0-1"], [])),
      ).toBe(true);
    });

    it("does not suppress a leaf without a fully shown value", () => {
      expect(
        isTreemapTooltipSuppressed("0-1", null, true, inlineIds([], [])),
      ).toBe(false);
    });

    it("suppresses a group header whose value+percent is shown", () => {
      expect(
        isTreemapTooltipSuppressed("0", null, true, inlineIds([], ["0"])),
      ).toBe(true);
    });

    it("does not suppress a group header without value+percent", () => {
      expect(
        isTreemapTooltipSuppressed("0", null, true, inlineIds([], [])),
      ).toBe(false);
    });
  });

  describe("single-level", () => {
    it("suppresses a root leaf whose value is fully shown", () => {
      expect(
        isTreemapTooltipSuppressed("0", null, false, inlineIds(["0"], [])),
      ).toBe(true);
    });

    it("does not suppress a root leaf without a fully shown value", () => {
      expect(
        isTreemapTooltipSuppressed("0", null, false, inlineIds([], [])),
      ).toBe(false);
    });
  });
});
