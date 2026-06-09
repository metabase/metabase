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
  it("returns the grand total with no group label at the overview", () => {
    expect(getTreemapBreadcrumbModel(TREE, null)).toEqual({
      groupLabel: null,
      value: 35,
    });
  });

  it("returns the drilled-in group's label and value", () => {
    expect(getTreemapBreadcrumbModel(TREE, "0")).toEqual({
      groupLabel: "Phones",
      value: 30,
    });
    expect(getTreemapBreadcrumbModel(TREE, "1")).toEqual({
      groupLabel: "Laptops",
      value: 5,
    });
  });

  it("falls back to the overview total when the view root is out of range", () => {
    expect(getTreemapBreadcrumbModel(TREE, "2")).toEqual({
      groupLabel: null,
      value: 35,
    });
  });
});
