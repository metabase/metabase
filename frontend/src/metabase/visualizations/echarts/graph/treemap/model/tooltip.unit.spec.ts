import { formatPercent } from "metabase/static-viz/lib/numbers";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";

import {
  getTreemapNodeId,
  getTreemapTooltipContext,
  getTreemapTooltipModel,
} from "./tooltip";
import type { TreemapNode, TreemapTree } from "./types";

const formatValue = (value: number) => `$${value}`;

const TWO_LEVEL: TreemapTree = [
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
  { rawName: "Tablets", displayName: "Tablets", value: 70, rowIndices: [2] },
];

describe("getTreemapNodeId", () => {
  it("encodes top-level and leaf ids", () => {
    expect(getTreemapNodeId(0)).toBe("0");
    expect(getTreemapNodeId(2)).toBe("2");
    expect(getTreemapNodeId(0, 1)).toBe("0-1");
  });
});

describe("getTreemapTooltipContext", () => {
  it("resolves a top-level id to the whole forest as siblings", () => {
    const context = getTreemapTooltipContext(TWO_LEVEL, "0", "Category");

    expect(context?.header).toBe("Category");
    expect(context?.siblings).toBe(TWO_LEVEL);
    expect(context?.focusedNode).toBe(TWO_LEVEL[0]);
    expect(context?.parentNode).toBeUndefined();
  });

  it("resolves a leaf id to its parent's children, header = parent name", () => {
    const context = getTreemapTooltipContext(TWO_LEVEL, "0-1", "Category");

    expect(context?.header).toBe("Phones");
    expect(context?.siblings).toBe(TWO_LEVEL[0].children);
    expect(context?.focusedNode).toBe(TWO_LEVEL[0].children?.[1]);
    expect(context?.parentNode).toBe(TWO_LEVEL[0]);
  });

  it("returns null for an unknown id", () => {
    expect(getTreemapTooltipContext(TWO_LEVEL, "9")).toBeNull();
    expect(getTreemapTooltipContext(TWO_LEVEL, "0-9")).toBeNull();
  });
});

describe("getTreemapTooltipModel", () => {
  const getColor = (node: TreemapNode) =>
    ({ Phones: "#aaaaaa", Tablets: "#bbbbbb" })[node.displayName];

  it("builds one row per sibling with name, formatted value, and percent of total", () => {
    const context = getTreemapTooltipContext(TWO_LEVEL, "0", "Category")!;
    const model = getTreemapTooltipModel(context, getColor, formatValue);

    expect(model.header).toBe("Category");
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toMatchObject({
      name: "Phones",
      isFocused: true,
      markerColorClass: getMarkerColorClass("#aaaaaa"),
      values: ["$30", formatPercent(0.3)],
    });
    expect(model.rows[1]).toMatchObject({
      name: "Tablets",
      isFocused: false,
      values: ["$70", formatPercent(0.7)],
    });
  });

  it("adds a Total footer when there is more than one sibling", () => {
    const context = getTreemapTooltipContext(TWO_LEVEL, "0", "Category")!;
    const model = getTreemapTooltipModel(context, getColor, formatValue);

    expect(model.footer).toMatchObject({
      values: ["$100", formatPercent(1)],
    });
  });

  it("omits the footer and marker when there is a single sibling without a color", () => {
    const single: TreemapTree = [
      { rawName: "A", displayName: "A", value: 5, rowIndices: [0] },
    ];
    const context = getTreemapTooltipContext(single, "0")!;
    const model = getTreemapTooltipModel(context, () => undefined, formatValue);

    expect(model.footer).toBeUndefined();
    expect(model.rows[0].markerColorClass).toBeUndefined();
  });

  it("uses 0% when the sibling total is zero", () => {
    const zero: TreemapTree = [
      { rawName: "A", displayName: "A", value: 0, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 0, rowIndices: [1] },
    ];
    const context = getTreemapTooltipContext(zero, "0")!;
    const model = getTreemapTooltipModel(context, () => undefined, formatValue);

    expect(model.rows[0].values[1]).toBe(formatPercent(0));
  });
});
