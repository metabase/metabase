import { getTreemapBreadcrumbModel } from "./breadcrumb";
import type { TreemapTree } from "./types";

const TREE: TreemapTree = [
  {
    rawName: "Phones",
    displayName: "Phones",
    value: 30,
    rowIndices: [0, 1],
    children: [
      { rawName: "iPhone", displayName: "iPhone", value: 20, rowIndices: [0] },
      { rawName: "Pixel", displayName: "Pixel", value: 10, rowIndices: [1] },
    ],
  },
  {
    rawName: "Laptops",
    displayName: "Laptops",
    value: 5,
    rowIndices: [2],
    children: [
      { rawName: "MacBook", displayName: "MacBook", value: 5, rowIndices: [2] },
    ],
  },
];

describe("getTreemapBreadcrumbModel", () => {
  it("returns null at the overview (no view root)", () => {
    expect(getTreemapBreadcrumbModel(TREE, null)).toBeNull();
  });

  it("returns the drilled-in group's label", () => {
    expect(getTreemapBreadcrumbModel(TREE, "0")).toEqual({
      groupLabel: "Phones",
    });
    expect(getTreemapBreadcrumbModel(TREE, "1")).toEqual({
      groupLabel: "Laptops",
    });
  });

  it("returns null when the view root is out of range", () => {
    expect(getTreemapBreadcrumbModel(TREE, "2")).toBeNull();
  });
});
