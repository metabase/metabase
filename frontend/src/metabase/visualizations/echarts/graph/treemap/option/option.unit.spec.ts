import { formatPercent } from "metabase/static-viz/lib/numbers";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import type { TreemapTree } from "../model/types";

import { getTreemapChartOption } from "./option";

// getTextColorForBackground parses these through the `color` library, so they
// must be real, parseable colors rather than the bare key.
const MOCK_COLORS: Record<string, string> = {
  "text-primary": "#4c5773",
  "text-primary-inverse": "#ffffff",
  "text-secondary": "#949aab",
  white: "#ffffff",
};

const renderingContext: RenderingContext = {
  getColor: (name) => MOCK_COLORS[name] ?? name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const TWO_LEVEL_TREE: TreemapTree = [
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
];

describe("getTreemapChartOption", () => {
  it("assigns path-based ids so interactions can resolve hovered nodes", () => {
    const { series } = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });

    expect(series.data[0].id).toBe("0");
    expect(series.data[0].children?.[0].id).toBe("0-0");
    expect(series.data[0].children?.[1].id).toBe("0-1");
  });

  it("applies tile label override branches: missing, none, labelOnly, and full", () => {
    const tree: TreemapTree = [
      {
        rawName: "Group",
        displayName: "Group",
        value: 100,
        rowIndices: [0, 1, 2, 3],
        children: [
          { rawName: "A", displayName: "A", value: 50, rowIndices: [0] }, // missing layout => hidden
          { rawName: "B", displayName: "B", value: 30, rowIndices: [1] }, // none
          { rawName: "C", displayName: "C", value: 15, rowIndices: [2] }, // labelOnly
          { rawName: "D", displayName: "D", value: 5, rowIndices: [3] }, // full
        ],
      },
    ];

    const { series } = getTreemapChartOption({
      tree,
      formatValue: (value) => `$${value}`,
      labelLayout: {
        "0-1": { detail: "none", width: 40 },
        "0-2": { detail: "labelOnly", width: 80 },
        "0-3": { detail: "full", width: 120 },
      },
      renderingContext,
    });

    const [a, b, c, d] = series.data[0].children ?? [];
    expect(a.label).toEqual({ show: false });
    expect(b.label).toEqual({ show: false });
    expect(c.label).toMatchObject({
      show: true,
      width: 80,
      overflow: "truncate",
      formatter: "C",
      color: expect.any(String),
    });
    expect(d.label).toMatchObject({
      show: true,
      width: 120,
      overflow: "truncate",
      formatter: `{name|D}\n{value|$5}\n{pct|${formatPercent(0.05)}}`,
      color: expect.any(String),
    });
  });

  it("uses the drilled group total for full leaf label percentages", () => {
    const tree: TreemapTree = [
      {
        rawName: "Group",
        displayName: "Group",
        value: 100,
        rowIndices: [0, 1, 2, 3],
        children: [
          { rawName: "A", displayName: "A", value: 60, rowIndices: [0] },
          { rawName: "B", displayName: "B", value: 40, rowIndices: [1] },
        ],
      },
      { rawName: "Other", displayName: "Other", value: 300, rowIndices: [4] },
    ];

    const { series } = getTreemapChartOption({
      tree,
      isDrilled: true,
      formatValue: (value) => `$${value}`,
      labelLayout: {
        "0-0": { detail: "full", width: 120 },
      },
      renderingContext,
    });

    expect(series.data[0].children?.[0].label).toMatchObject({
      show: true,
      width: 120,
      overflow: "truncate",
      formatter: `{name|A}\n{value|$60}\n{pct|${formatPercent(0.6)}}`,
      color: expect.any(String),
    });
  });

  it("applies upper label defaults and per-group overrides", () => {
    const overview = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      renderingContext,
    });
    const drilled = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      isDrilled: true,
      renderingContext,
    });
    const rich = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      formatValue: (value) => `$${value}`,
      parentLabelLayout: {
        "0": { showText: true, showValuePercent: true, nameColumnWidth: 90 },
      },
      renderingContext,
    });
    const hiddenText = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      parentLabelLayout: {
        "0": { showText: false, showValuePercent: false },
      },
      renderingContext,
    });

    expect(overview.series.levels?.[1]?.upperLabel).toMatchObject({
      show: true,
    });
    expect(drilled.series.levels?.[1]?.upperLabel).toMatchObject({
      show: false,
    });

    expect(rich.series.data[0].upperLabel?.formatter).toBe(
      `{name|Legumes}{value|$30}{pct|${formatPercent(1)}}`,
    );
    expect(rich.series.data[0].upperLabel?.rich).toMatchObject({
      name: { width: 90, overflow: "truncate" },
    });

    expect(hiddenText.series.data[0].upperLabel).toMatchObject({
      color: "transparent",
      backgroundColor: expect.any(String),
    });
  });

  it("hides series and per-tile labels when showLeafLabels is false", () => {
    const twoLevel = getTreemapChartOption({
      tree: TWO_LEVEL_TREE,
      showLeafLabels: false,
      renderingContext,
    });
    const oneLevel = getTreemapChartOption({
      tree: [
        { rawName: "A", displayName: "A", value: 10, rowIndices: [0] },
        { rawName: "B", displayName: "B", value: 25, rowIndices: [1] },
      ],
      showLeafLabels: false,
      renderingContext,
    });

    expect(twoLevel.series.label).toMatchObject({ show: false });
    twoLevel.series.data.forEach((group) => {
      group.children?.forEach((leaf) => {
        expect(leaf.label).toMatchObject({ show: false });
      });
    });
    oneLevel.series.data.forEach((tile) => {
      expect(tile.label).toMatchObject({ show: false });
    });
  });
});
