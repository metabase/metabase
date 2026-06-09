import Color from "color";

import { formatPercent } from "metabase/static-viz/lib/numbers";
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

  it("makes the between-group separators transparent (canvas-colored, for dark mode)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    // The synthetic root's gaps separate the groups; a transparent borderColor
    // reveals the canvas behind instead of painting white separators that look
    // wrong on a dark-mode background.
    expect(series.levels?.[0]?.itemStyle?.borderColor).toBe("transparent");
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

describe("getTreemapChartOption wrapping", () => {
  it("enables word-wrapping with vertical truncation on the series label", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.label).toMatchObject({
      overflow: "break",
      lineOverflow: "truncate",
    });
  });
});

describe("getTreemapChartOption labelLayout override", () => {
  const twoLevel: TreemapTree = [
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

  it("hides a leaf label and sets its wrap width from the measured layout", () => {
    const { series } = getTreemapChartOption({
      tree: twoLevel,
      labelLayout: { "0-0": { show: false, detail: "none", width: 50 } },
      renderingContext,
    });
    const [big] = series.data[0].children ?? [];

    expect(big.label).toEqual({ show: false, width: 50 });
  });

  it("shows a leaf label and wraps it, overriding the area-share heuristic", () => {
    const { series } = getTreemapChartOption({
      tree: twoLevel,
      labelLayout: { "0-1": { show: true, detail: "labelOnly", width: 120 } },
      renderingContext,
    });
    const [, tiny] = series.data[0].children ?? [];

    // Without the override, "Tiny" (2% share) would be hidden by area-share.
    expect(tiny.label).toEqual({ show: true, width: 120 });
  });

  it("falls back to the area-share heuristic for ids not in the map", () => {
    const { series } = getTreemapChartOption({
      tree: twoLevel,
      labelLayout: { "0-0": { show: false, detail: "none", width: 50 } },
      renderingContext,
    });
    const [, tiny] = series.data[0].children ?? [];

    // "0-1" is absent from the map, so the area-share proxy still hides it.
    expect(tiny.label).toMatchObject({ show: false });
  });

  it("applies the layout to a 1-level treemap's tiles by id", () => {
    const oneLevel: TreemapTree = [
      { rawName: "A", displayName: "A", value: 99, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 1, rowIndices: [1] },
    ];

    const { series } = getTreemapChartOption({
      tree: oneLevel,
      labelLayout: {
        "0": { show: false, detail: "none", width: 200 },
        "1": { show: true, detail: "labelOnly", width: 30 },
      },
      renderingContext,
    });

    expect(series.data[0].label).toEqual({ show: false, width: 200 });
    // "B" would be area-share-hidden, but the layout shows it.
    expect(series.data[1].label).toEqual({ show: true, width: 30 });
  });
});

describe("getTreemapChartOption full inline block", () => {
  // G = 100 (grand total); Big = 98, Tiny = 2 → shares of whole are 98% / 2%.
  const twoLevel: TreemapTree = [
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
  const formatValue = (value: number) => `$${value}`;

  it("renders a 'full' leaf as a stacked name / value / percentage rich block", () => {
    const { series } = getTreemapChartOption({
      tree: twoLevel,
      labelLayout: { "0-0": { show: true, detail: "full", width: 150 } },
      formatValue,
      renderingContext,
    });
    const [big] = series.data[0].children ?? [];

    expect(big.label).toEqual({
      show: true,
      width: 150,
      // value/percentage lines stay single-line (truncate), unlike the
      // name-only label which keeps the series' word-wrap.
      overflow: "truncate",
      formatter: `{name|Big}\n{value|$98}\n{pct|${formatPercent(0.98)}}`,
    });
  });

  it("computes the percentage as share of the whole (leaf value over grand total)", () => {
    const { series } = getTreemapChartOption({
      tree: twoLevel,
      labelLayout: { "0-1": { show: true, detail: "full", width: 150 } },
      formatValue,
      renderingContext,
    });
    const [, tiny] = series.data[0].children ?? [];

    // Tiny = 2 of 100 → 2%, not its share of the parent group.
    expect(tiny.label?.formatter).toBe(
      `{name|Tiny}\n{value|$2}\n{pct|${formatPercent(0.02)}}`,
    );
  });

  it("defines the block rich styles (name bold 12, value bold 20, percent regular 12)", () => {
    const { series } = getTreemapChartOption({
      tree: twoLevel,
      renderingContext,
    });

    expect(series.label?.rich).toMatchObject({
      name: { fontSize: 12, fontWeight: 700 },
      value: { fontSize: 20, fontWeight: 700 },
      pct: { fontSize: 12, fontWeight: 400 },
    });
  });

  it("applies the full block to a 1-level treemap tile", () => {
    const oneLevel: TreemapTree = [
      { rawName: "A", displayName: "A", value: 75, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
    ];

    const { series } = getTreemapChartOption({
      tree: oneLevel,
      labelLayout: { "0": { show: true, detail: "full", width: 200 } },
      formatValue,
      renderingContext,
    });

    expect(series.data[0].label).toEqual({
      show: true,
      width: 200,
      overflow: "truncate",
      formatter: `{name|A}\n{value|$75}\n{pct|${formatPercent(0.75)}}`,
    });
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

  it("hides the group header at the overview when showParentLabels is false", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      showParentLabels: false,
      renderingContext,
    });

    expect(series.levels?.[1]?.upperLabel).toMatchObject({ show: false });
  });

  it("shows the group header at the overview when showParentLabels is true (the default)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      showParentLabels: true,
      renderingContext,
    });

    expect(series.levels?.[1]?.upperLabel).toMatchObject({ show: true });
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

  it("disables ECharts' built-in per-node emphasis (hover is the section overlay instead)", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.emphasis).toEqual({ disabled: true });
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

  it("suppresses the header text (transparent) for a group whose chip is too narrow, keeping the band", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      // Group "0" measured too narrow to fit its label.
      parentLabelLayout: { "0": { showText: false, showValuePercent: false } },
      renderingContext,
    });

    expect(Color(series.data[0].upperLabel?.color).alpha()).toBe(0);
    // The band's background tint is still set, so the chip box remains.
    expect(series.data[0].upperLabel?.backgroundColor).toBeDefined();
  });

  it("keeps the header text for a group whose chip fits its label", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      parentLabelLayout: { "0": { showText: true, showValuePercent: false } },
      renderingContext,
    });

    expect(series.data[0].upperLabel?.color).toBeUndefined();
  });

  it("keeps the header text when no parentLabelLayout is provided", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.data[0].upperLabel?.color).toBeUndefined();
  });
});

describe("getTreemapChartOption group header value + percentage", () => {
  // Europe = 30, Asia = 70 → grand total 100, so Europe's header share is 30%.
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
    {
      rawName: "Asia",
      displayName: "Asia",
      value: 70,
      rowIndices: [2],
      children: [
        { rawName: "China", displayName: "China", value: 70, rowIndices: [2] },
      ],
    },
  ];
  const formatValue = (value: number) => `$${value}`;

  it("renders the name in a fixed-width column with value + percentage flush right", () => {
    const { series } = getTreemapChartOption({
      tree,
      parentLabelLayout: {
        "0": { showText: true, showValuePercent: true, nameColumnWidth: 80 },
      },
      formatValue,
      renderingContext,
    });

    expect(series.data[0].upperLabel?.formatter).toBe(
      `{name|Europe}{value|$30}{pct|${formatPercent(0.3)}}`,
    );
    // Name column is sized to the measured width; the cluster fonts match the
    // header (value bold, percent regular).
    expect(series.data[0].upperLabel?.rich).toMatchObject({
      name: { width: 80, overflow: "truncate" },
      value: { fontWeight: 700 },
      pct: { fontWeight: 400 },
    });
    // The chip band tint is still set.
    expect(series.data[0].upperLabel?.backgroundColor).toBeDefined();
  });

  it("renders the name only (no formatter) when the chip can't fit the value+%", () => {
    const { series } = getTreemapChartOption({
      tree,
      parentLabelLayout: {
        "0": { showText: true, showValuePercent: false },
      },
      formatValue,
      renderingContext,
    });

    expect(series.data[0].upperLabel?.formatter).toBeUndefined();
    expect(series.data[0].upperLabel?.rich).toBeUndefined();
  });
});

describe("getTreemapChartOption leaf labels", () => {
  it("shows leaf labels by default", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.label).toMatchObject({ show: true });
  });

  it("hides the series-level leaf label when showLeafLabels is false", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      showLeafLabels: false,
      renderingContext,
    });

    expect(series.label).toMatchObject({ show: false });
  });

  it("forces every leaf tile's label off when showLeafLabels is false", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      showLeafLabels: false,
      renderingContext,
    });

    series.data.forEach((group) => {
      group.children?.forEach((leaf) => {
        expect(leaf.label).toMatchObject({ show: false });
      });
    });
  });

  it("hides labels on a 1-level treemap's tiles when showLeafLabels is false", () => {
    const tree: TreemapTree = [
      { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
    ];

    const { series } = getTreemapChartOption({
      tree,
      showLeafLabels: false,
      renderingContext,
    });

    series.data.forEach((node) => {
      expect(node.label).toMatchObject({ show: false });
    });
  });
});
