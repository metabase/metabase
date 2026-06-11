import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";

import {
  TREEMAP_LEGEND_GROUP_GAP,
  TREEMAP_LEGEND_ROW_GAP,
  TREEMAP_LEGEND_ROW_HEIGHT,
  TREEMAP_LEGEND_TOTAL_PADDING_TOP,
  getTreemapLegendModel,
} from "./legend";

const formatValue = (value: number) => `$${value}`;

const twoLevelTree: TreemapTree = [
  {
    rawName: "Legumes",
    displayName: "Legumes",
    value: 60,
    rowIndices: [0, 1],
    children: [
      {
        rawName: "Chickpeas",
        displayName: "Chickpeas",
        value: 40,
        rowIndices: [0],
      },
      {
        rawName: "Lentils",
        displayName: "Lentils",
        value: 20,
        rowIndices: [1],
      },
    ],
  },
  {
    rawName: "Soy",
    displayName: "Soy",
    value: 40,
    rowIndices: [2],
    children: [
      {
        rawName: "Tempeh",
        displayName: "Tempeh",
        value: 40,
        rowIndices: [2],
      },
    ],
  },
];

const oneLevelTree: TreemapTree = [
  {
    rawName: "Chickpeas",
    displayName: "Chickpeas",
    value: 75,
    rowIndices: [0],
  },
  { rawName: "Lentils", displayName: "Lentils", value: 25, rowIndices: [1] },
];

const colors = {
  Legumes: "#509ee3",
  Soy: "#88bf4d",
};

describe("getTreemapLegendModel", () => {
  describe("2-level tree", () => {
    it("renders a bold dotted parent row per group with indented leaf rows and an indented total", () => {
      const { rows } = getTreemapLegendModel(twoLevelTree, colors, formatValue);

      expect(rows.map((row) => [row.type, row.name, row.indent])).toEqual([
        ["parent", "Legumes", false],
        ["leaf", "Chickpeas", true],
        ["leaf", "Lentils", true],
        ["parent", "Soy", false],
        ["leaf", "Tempeh", true],
        ["total", "Total", true],
      ]);
      expect(rows[0].color).toBe("#509ee3");
      expect(rows[3].color).toBe("#88bf4d");
      expect(rows[1].color).toBeUndefined();
      expect(rows[5].color).toBeUndefined();
    });

    it("formats values with the given formatter and percents as share of the whole", () => {
      const { rows } = getTreemapLegendModel(twoLevelTree, colors, formatValue);

      expect(rows.map((row) => row.valueLabel)).toEqual([
        "$60",
        "$40",
        "$20",
        "$40",
        "$40",
        "$100",
      ]);
      expect(rows.map((row) => row.percentLabel)).toEqual([
        "60.00 %",
        "40.00 %",
        "20.00 %",
        "40.00 %",
        "40.00 %",
        "100 %",
      ]);
    });

    it("stacks rows with the row gap, groups with the group gap, and pads the total", () => {
      const { rows, height } = getTreemapLegendModel(
        twoLevelTree,
        colors,
        formatValue,
      );

      const rowPitch = TREEMAP_LEGEND_ROW_HEIGHT + TREEMAP_LEGEND_ROW_GAP;
      const groupPitch = TREEMAP_LEGEND_ROW_HEIGHT + TREEMAP_LEGEND_GROUP_GAP;
      const tops = rows.map((row) => row.top);
      expect(tops[0]).toBe(0);
      expect(tops[1]).toBe(rowPitch);
      expect(tops[2]).toBe(rowPitch * 2);
      expect(tops[3]).toBe(rowPitch * 2 + groupPitch);
      expect(tops[4]).toBe(rowPitch * 2 + groupPitch + rowPitch);
      expect(tops[5]).toBe(
        tops[4] + groupPitch + TREEMAP_LEGEND_TOTAL_PADDING_TOP,
      );
      expect(height).toBe(tops[5] + TREEMAP_LEGEND_ROW_HEIGHT);
    });
  });

  describe("1-level tree", () => {
    it("renders flat regular rows with no dots or indentation, including the total", () => {
      const { rows } = getTreemapLegendModel(oneLevelTree, {}, formatValue);

      expect(rows.map((row) => [row.type, row.name, row.indent])).toEqual([
        ["leaf", "Chickpeas", false],
        ["leaf", "Lentils", false],
        ["total", "Total", false],
      ]);
      expect(rows.every((row) => row.color === undefined)).toBe(true);
      expect(rows.map((row) => row.percentLabel)).toEqual([
        "75.00 %",
        "25.00 %",
        "100 %",
      ]);
    });
  });

  it("renders only a zero total for an empty tree", () => {
    const { rows } = getTreemapLegendModel([], {}, formatValue);

    expect(rows).toEqual([
      expect.objectContaining({
        type: "total",
        valueLabel: "$0",
        percentLabel: "100 %",
        top: TREEMAP_LEGEND_TOTAL_PADDING_TOP,
      }),
    ]);
  });
});
