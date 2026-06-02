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

describe("getTreemapChartOption within-group borders", () => {
  it("colors a group's internal borders with the same lightened tint as its header chip", () => {
    const colors = getTreemapColors(TWO_LEVEL_TREE);
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      colors,
      renderingContext,
    });
    const node = series.data[0];

    // ECharts fills a parent node's background with its borderColor and draws
    // the leaf children on top with gaps, so the within-group gaps show this
    // color — which matches the header chip tint, not the full group hue.
    expect(node.itemStyle?.borderColor).toBe(node.upperLabel?.backgroundColor);
    expect(node.itemStyle?.borderColor).not.toBe(colors["Europe"]);
  });

  it("leaves the between-group separators white (no borderColor override on the root level)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    // The synthetic root's gaps separate the groups; leaving its borderColor at
    // the ECharts default keeps those separators white.
    expect(series.levels?.[0]?.itemStyle?.borderColor).toBeUndefined();
  });

  it("uses a hueless transparent border when drilled into a group (level 2)", () => {
    const colors = getTreemapColors(TWO_LEVEL_TREE);
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      colors,
      isDrilled: true,
      renderingContext,
    });

    // Drilled in, the group fills the canvas; a transparent border reveals the
    // white canvas in the gaps instead of the group hue.
    expect(series.data[0].itemStyle?.borderColor).toBe("transparent");
  });

  it("tints only the inter-leaf gaps, not the group's outer frame (group borderWidth is 0)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    // The group's outer frame (borderWidth) is filled with borderColor too, so
    // keeping it at 0 means only the gapWidth separators between leaves show the
    // tint — the group's outer edge stays untinted (white root gap separates
    // groups).
    expect(series.levels?.[1]?.itemStyle?.borderWidth).toBe(0);
    expect(series.levels?.[1]?.itemStyle?.gapWidth).toBeGreaterThan(0);
  });

  it("does not set a group borderColor on the tiles of a 1-level treemap", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
    ];

    const { series } = getTreemapChartOption({ tree, renderingContext });

    series.data.forEach((node) => {
      expect(node.itemStyle?.borderColor).toBeUndefined();
    });
  });
});

describe("getTreemapChartOption small-node labels", () => {
  it("hides the label on a leaf whose area share is below the threshold", () => {
    const tree: TreemapTree = [
      {
        rawName: "G",
        displayName: "G",
        value: 100,
        rowIndices: [0, 1],
        children: [
          { rawName: "Big", displayName: "Big", value: 98, rowIndices: [0] },
          { rawName: "Tiny", displayName: "Tiny", value: 2, rowIndices: [1] },
        ],
      },
    ];

    const { series } = getTreemapChartOption({ tree, renderingContext });
    const [big, tiny] = series.data[0].children ?? [];

    expect(tiny.label).toMatchObject({ show: false });
    expect(big.label?.show).not.toBe(false);
  });

  it("hides the label on a small tile in a 1-level treemap", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 99, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 1, rowIndices: [1] },
    ];

    const { series } = getTreemapChartOption({ tree, renderingContext });

    expect(series.data[1].label).toMatchObject({ show: false });
    expect(series.data[0].label?.show).not.toBe(false);
  });

  it("keeps top-level group headers visible even when the group is a small share", () => {
    const tree: TreemapTree = [
      {
        rawName: "Big",
        displayName: "Big",
        value: 99,
        rowIndices: [0],
        children: [
          {
            rawName: "Big-1",
            displayName: "Big-1",
            value: 99,
            rowIndices: [0],
          },
        ],
      },
      {
        rawName: "Small",
        displayName: "Small",
        value: 1,
        rowIndices: [1],
        children: [
          {
            rawName: "Small-1",
            displayName: "Small-1",
            value: 1,
            rowIndices: [1],
          },
        ],
      },
    ];

    const { series } = getTreemapChartOption({ tree, renderingContext });

    // The small group's own label is never force-hidden — its header chip stays.
    expect(series.data[1].label?.show).not.toBe(false);
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

  it("backs each group header with an opaque, lightened tint of the group's color", () => {
    const colors = getTreemapColors(TWO_LEVEL_TREE);
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      colors,
      renderingContext,
    });

    const headerBg = series.data[0].upperLabel?.backgroundColor;
    // The chip sits on the group's own opaque background fill (the borderColor
    // that tints the within-group gaps), so a translucent color would be
    // invisible. Instead it's an opaque blend of the group hue toward white,
    // which reads as a translucent band and is lighter than the pure hue.
    expect(Color(headerBg).alpha()).toBe(1);
    expect(Color(headerBg).hex()).not.toBe(Color(colors["Europe"]).hex());
    expect(Color(headerBg).luminosity()).toBeGreaterThan(
      Color(colors["Europe"]).luminosity(),
    );
  });
});
