import { getTreemapColors } from "../model/colors";
import type { TreemapTree } from "../model/types";

import { getTreemapChartOption } from "./option";

const TWO_LEVEL_TREE: TreemapTree = [
  {
    rawName: "Europe",
    displayName: "Europe",
    value: 30,
    rowIndices: [0, 1],
    children: [
      { rawName: "Sweden", displayName: "Sweden", value: 20, rowIndices: [0] },
      {
        rawName: "Germany",
        displayName: "Germany",
        value: 10,
        rowIndices: [1],
      },
    ],
  },
];

describe("getTreemapChartOption (1-level)", () => {
  it("produces a single treemap series", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
    ];

    const option = getTreemapChartOption(tree);

    expect(option.series).toMatchObject({ type: "treemap" });
  });

  it("emits one series data entry per top-level node", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0, 2] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      { rawName: "C", displayName: "C", value: 7, rowIndices: [3] },
    ];

    const option = getTreemapChartOption(tree);
    const data = option.series.data;

    expect(data).toHaveLength(3);
    expect(data[0]).toMatchObject({ name: "A", value: 10 });
    expect(data[1]).toMatchObject({ name: "B", value: 25 });
    expect(data[2]).toMatchObject({ name: "C", value: 7 });
  });

  it("preserves rowIndices and rawName on each data node for downstream drill-through", () => {
    const tree: TreemapTree = [
      { rawName: null, displayName: "", value: 4, rowIndices: [0, 1] },
      { rawName: "A", displayName: "A", value: 8, rowIndices: [2] },
    ];

    const option = getTreemapChartOption(tree);
    const data = option.series.data;

    expect(data[0]).toMatchObject({
      rawName: null,
      rowIndices: [0, 1],
    });
    expect(data[1]).toMatchObject({
      rawName: "A",
      rowIndices: [2],
    });
  });

  it("returns an empty data array for an empty tree", () => {
    const option = getTreemapChartOption([]);
    expect(option.series.data).toEqual([]);
  });
});

describe("getTreemapChartOption colors", () => {
  it("colors each top-level node via getTreemapColors", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
    ];

    const colors = getTreemapColors(tree);
    const { series } = getTreemapChartOption(tree);

    expect(series.data[0].itemStyle?.color).toBe(colors["A"]);
    expect(series.data[1].itemStyle?.color).toBe(colors["B"]);
  });

  it("assigns distinct colors to distinct top-level nodes", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      { rawName: "C", displayName: "C", value: 7, rowIndices: [2] },
    ];

    const { series } = getTreemapChartOption(tree);
    const used = series.data.map((node) => node.itemStyle?.color);

    expect(new Set(used).size).toBe(3);
  });

  it("does not set explicit colors on sub-grouping leaves so they inherit the parent hue", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);
    const [root] = series.data;

    expect(root.itemStyle?.color).toBeTruthy();
    expect(root.children).toHaveLength(2);
    root.children?.forEach((leaf) => {
      expect(leaf.itemStyle?.color).toBeUndefined();
    });
  });

  it("emits a colorSaturation offset on the leaf level so children render as lighter shades", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);

    expect(series.levels?.[1]?.colorSaturation).toBeDefined();
  });
});

describe("getTreemapChartOption ids", () => {
  it("assigns path-based ids so the tooltip can resolve a hovered node", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);

    expect(series.data[0].id).toBe("0");
    expect(series.data[0].children?.[0].id).toBe("0-0");
    expect(series.data[0].children?.[1].id).toBe("0-1");
  });
});

describe("getTreemapChartOption zoom", () => {
  it("disables native click (drilling is handled by a custom click handler)", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);

    expect(series.nodeClick).toBe(false);
  });

  it("keeps the initial view at two levels via leafDepth", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);

    expect(series.leafDepth).toBe(2);
  });

  it("disables wheel/drag roam zoom on the series", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);

    expect(series.roam).toBe(false);
  });

  it("hides the native breadcrumb (a custom React breadcrumb replaces it)", () => {
    const { series } = getTreemapChartOption(TWO_LEVEL_TREE);

    expect(series.breadcrumb).toMatchObject({ show: false });
  });
});
