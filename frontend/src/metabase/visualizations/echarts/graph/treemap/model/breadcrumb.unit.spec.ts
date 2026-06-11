import { getTreemapBreadcrumbModel } from "./breadcrumb";
import type { TreemapTree } from "./types";

const TREE: TreemapTree = [
  {
    rawName: "Legumes",
    displayName: "Legumes",
    value: 30,
    rowIndices: [0, 1],
    children: [
      {
        rawName: "Chickpeas",
        displayName: "Chickpeas",
        value: 20,
        rowIndices: [0],
      },
      {
        rawName: "Lentils",
        displayName: "Lentils",
        value: 10,
        rowIndices: [1],
      },
    ],
  },
  {
    rawName: "Soy",
    displayName: "Soy",
    value: 5,
    rowIndices: [2],
    children: [
      { rawName: "Tempeh", displayName: "Tempeh", value: 5, rowIndices: [2] },
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
      groupLabel: "Legumes",
      value: 30,
    });
    expect(getTreemapBreadcrumbModel(TREE, "1")).toEqual({
      groupLabel: "Soy",
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
