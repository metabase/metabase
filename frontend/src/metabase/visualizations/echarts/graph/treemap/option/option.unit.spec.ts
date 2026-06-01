import Color from "color";

import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { getTreemapColors } from "../model/colors";
import type { TreemapTree } from "../model/types";

import { getTreemapChartOption } from "./option";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

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

    const option = getTreemapChartOption({ tree, renderingContext });

    expect(option.series).toMatchObject({ type: "treemap" });
  });

  it("emits one series data entry per top-level node", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0, 2] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      { rawName: "C", displayName: "C", value: 7, rowIndices: [3] },
    ];

    const option = getTreemapChartOption({ tree, renderingContext });
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

    const option = getTreemapChartOption({ tree, renderingContext });
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
    const option = getTreemapChartOption({ tree: [], renderingContext });
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
    const { series } = getTreemapChartOption({ tree, renderingContext });

    expect(series.data[0].itemStyle?.color).toBe(colors["A"]);
    expect(series.data[1].itemStyle?.color).toBe(colors["B"]);
  });

  it("assigns distinct colors to distinct top-level nodes", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      { rawName: "C", displayName: "C", value: 7, rowIndices: [2] },
    ];

    const { series } = getTreemapChartOption({ tree, renderingContext });
    const used = series.data.map((node) => node.itemStyle?.color);

    expect(new Set(used).size).toBe(3);
  });

  it("does not set explicit colors on sub-grouping leaves so they inherit the parent hue", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });
    const [root] = series.data;

    expect(root.itemStyle?.color).toBeTruthy();
    expect(root.children).toHaveLength(2);
    root.children?.forEach((leaf) => {
      expect(leaf.itemStyle?.color).toBeUndefined();
    });
  });

  it("emits a colorSaturation offset on the leaf level so children render as lighter shades", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.levels?.[1]?.colorSaturation).toBeDefined();
  });
});

describe("getTreemapChartOption ids", () => {
  it("assigns path-based ids so the tooltip can resolve a hovered node", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.data[0].id).toBe("0");
    expect(series.data[0].children?.[0].id).toBe("0-0");
    expect(series.data[0].children?.[1].id).toBe("0-1");
  });
});

describe("getTreemapChartOption zoom", () => {
  it("disables native click (drilling is handled by a custom click handler)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.nodeClick).toBe(false);
  });

  it("keeps the initial view at two levels via leafDepth", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.leafDepth).toBe(2);
  });

  it("disables wheel/drag roam zoom on the series", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.roam).toBe(false);
  });

  it("hides the native breadcrumb (a custom React breadcrumb replaces it)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.breadcrumb).toMatchObject({ show: false });
  });
});

describe("getTreemapChartOption layout", () => {
  it("is full-bleed with no bottom inset at the overview", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series).toMatchObject({ top: 0, left: 0, right: 0, bottom: 0 });
  });

  it("reserves bottom space for the breadcrumb when drilled", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      colors: getTreemapColors(TWO_LEVEL_TREE),
      isDrilled: true,
      renderingContext,
    });

    expect(series.bottom).toBeGreaterThan(0);
  });
});

describe("getTreemapChartOption group header", () => {
  it("shows the group header on the group level (levels[1]) at the overview", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.levels?.[1]?.upperLabel).toMatchObject({ show: true });
    expect(series.levels?.[1]?.upperLabel?.height).toBeGreaterThan(0);
  });

  it("keeps the synthetic root's header (levels[0] + series) off so it doesn't inset the top of the treemap", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.upperLabel).toMatchObject({ show: false });
    expect(series.levels?.[0]?.upperLabel).toMatchObject({ show: false });
  });

  it("hides the group header when drilled (the breadcrumb shows the group)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      colors: getTreemapColors(TWO_LEVEL_TREE),
      isDrilled: true,
      renderingContext,
    });

    expect(series.levels?.[1]?.upperLabel).toMatchObject({ show: false });
  });

  it("keeps the header identical on hover so it doesn't shift (emphasis mirrors normal)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.levels?.[1]?.emphasis?.upperLabel).toEqual(
      series.levels?.[1]?.upperLabel,
    );
  });

  it("backs each group header with the group's color at reduced opacity", () => {
    const colors = getTreemapColors(TWO_LEVEL_TREE);
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      colors,
      renderingContext,
    });

    const headerBg = series.data[0].upperLabel?.backgroundColor;
    expect(headerBg).toMatch(/^rgba\(/);
    // Same hue as the group's tile color, just translucent.
    expect(Color(headerBg).hex()).toBe(Color(colors["Europe"]).hex());
    expect(Color(headerBg).alpha()).toBeCloseTo(0.85);
  });
});
