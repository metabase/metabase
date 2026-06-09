import { formatPercent } from "metabase/static-viz/lib/numbers";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";

import {
  getTreemapInlineValueIds,
  getTreemapNodeId,
  getTreemapTooltipContext,
  getTreemapTooltipModel,
  isTreemapTooltipSuppressed,
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
  describe("overview (not drilled in)", () => {
    it("resolves a top-level id to the whole forest, focused on that group", () => {
      const context = getTreemapTooltipContext(
        TWO_LEVEL,
        "0",
        null,
        "Category",
      );

      expect(context?.header).toBe("Category");
      expect(context?.siblings).toBe(TWO_LEVEL);
      expect(context?.focusedNode).toBe(TWO_LEVEL[0]);
      expect(context?.parentNode).toBeUndefined();
    });

    it("resolves a sub-group id to the forest, focused on its top-level group", () => {
      const context = getTreemapTooltipContext(
        TWO_LEVEL,
        "0-1",
        null,
        "Category",
      );

      expect(context?.header).toBe("Category");
      expect(context?.siblings).toBe(TWO_LEVEL);
      expect(context?.focusedNode).toBe(TWO_LEVEL[0]);
      expect(context?.parentNode).toBeUndefined();
    });

    it("returns null for an unknown top-level id", () => {
      expect(getTreemapTooltipContext(TWO_LEVEL, "9", null)).toBeNull();
    });
  });

  describe("drilled into a group", () => {
    it("resolves a sub-group id to the drilled group's children", () => {
      const context = getTreemapTooltipContext(
        TWO_LEVEL,
        "0-1",
        "0",
        "Category",
      );

      expect(context?.header).toBe("Phones");
      expect(context?.siblings).toBe(TWO_LEVEL[0].children);
      expect(context?.focusedNode).toBe(TWO_LEVEL[0].children?.[1]);
      expect(context?.parentNode).toBe(TWO_LEVEL[0]);
    });

    it("returns null when the drilled group has no children", () => {
      expect(getTreemapTooltipContext(TWO_LEVEL, "1-0", "1")).toBeNull();
    });

    it("returns null for an unknown sub-group id", () => {
      expect(getTreemapTooltipContext(TWO_LEVEL, "0-9", "0")).toBeNull();
    });
  });
});

describe("getTreemapTooltipModel", () => {
  const getColor = (node: TreemapNode) =>
    ({ Phones: "#aaaaaa", Tablets: "#bbbbbb" })[node.displayName];

  it("builds one row per sibling with name, formatted value, and percent of total, sorted by value descending", () => {
    const context = getTreemapTooltipContext(TWO_LEVEL, "0", null, "Category")!;
    const model = getTreemapTooltipModel(context, getColor, formatValue);

    expect(model.header).toBe("Category");
    expect(model.rows).toHaveLength(2);
    // Rows are ordered by the measure, largest first — Tablets ($70) before
    // Phones ($30) — regardless of the tree's source order. The hovered group
    // (Phones) stays flagged as focused wherever it lands.
    expect(model.rows[0]).toMatchObject({
      name: "Tablets",
      isFocused: false,
      markerColorClass: getMarkerColorClass("#bbbbbb"),
      values: ["$70", formatPercent(0.7)],
    });
    expect(model.rows[1]).toMatchObject({
      name: "Phones",
      isFocused: true,
      markerColorClass: getMarkerColorClass("#aaaaaa"),
      values: ["$30", formatPercent(0.3)],
    });
  });

  it("sorts the sub-group breakdown by value descending when drilled in", () => {
    const tree: TreemapTree = [
      {
        rawName: "Phones",
        displayName: "Phones",
        value: 60,
        rowIndices: [0, 1, 2],
        children: [
          {
            rawName: "Pixel",
            displayName: "Pixel",
            value: 10,
            rowIndices: [0],
          },
          {
            rawName: "iPhone",
            displayName: "iPhone",
            value: 35,
            rowIndices: [1],
          },
          {
            rawName: "Galaxy",
            displayName: "Galaxy",
            value: 15,
            rowIndices: [2],
          },
        ],
      },
    ];
    // Drilled into group "0" (Phones), hovering its first sub-group.
    const context = getTreemapTooltipContext(tree, "0-0", "0")!;
    const model = getTreemapTooltipModel(context, () => undefined, formatValue);

    expect(model.rows.map((row) => row.name)).toEqual([
      "iPhone",
      "Galaxy",
      "Pixel",
    ]);
  });

  it("adds a Total footer when there is more than one sibling", () => {
    const context = getTreemapTooltipContext(TWO_LEVEL, "0", null, "Category")!;
    const model = getTreemapTooltipModel(context, getColor, formatValue);

    expect(model.footer).toMatchObject({
      values: ["$100", formatPercent(1)],
    });
  });

  it("omits the footer and marker when there is a single sibling without a color", () => {
    const single: TreemapTree = [
      { rawName: "A", displayName: "A", value: 5, rowIndices: [0] },
    ];
    const context = getTreemapTooltipContext(single, "0", null)!;
    const model = getTreemapTooltipModel(context, () => undefined, formatValue);

    expect(model.footer).toBeUndefined();
    expect(model.rows[0].markerColorClass).toBeUndefined();
  });

  it("uses 0% when the sibling total is zero", () => {
    const zero: TreemapTree = [
      { rawName: "A", displayName: "A", value: 0, rowIndices: [0] },
      { rawName: "B", displayName: "B", value: 0, rowIndices: [1] },
    ];
    const context = getTreemapTooltipContext(zero, "0", null)!;
    const model = getTreemapTooltipModel(context, () => undefined, formatValue);

    expect(model.rows[0].values[1]).toBe(formatPercent(0));
  });
});

describe("getTreemapInlineValueIds", () => {
  it("collects full leaves and value+% headers into separate sets", () => {
    const ids = getTreemapInlineValueIds(
      {
        "0-0": { show: true, detail: "full", width: 100 },
        "0-1": { show: true, detail: "labelOnly", width: 100 },
        "0-2": { show: false, detail: "none", width: 100 },
      },
      {
        "0": { showText: true, showValuePercent: true, nameColumnWidth: 50 },
        "1": { showText: true, showValuePercent: false },
      },
    );

    expect(ids).toEqual({
      fullLeafIds: new Set(["0-0"]),
      valuePercentHeaderIds: new Set(["0"]),
    });
  });

  it("returns empty sets when nothing is shown inline", () => {
    expect(getTreemapInlineValueIds({}, {})).toEqual({
      fullLeafIds: new Set(),
      valuePercentHeaderIds: new Set(),
    });
  });
});

describe("isTreemapTooltipSuppressed", () => {
  const inline = {
    fullLeafIds: new Set(["0-0", "1-0"]),
    valuePercentHeaderIds: new Set(["0"]),
  };

  describe("2-level overview (viewRootId null, isTwoLevel true)", () => {
    it("suppresses any element whose top-level group header shows the value+%", () => {
      // Group "0" header shows value+%, so both its header and its sub-groups
      // suppress the (group-level) tooltip.
      expect(isTreemapTooltipSuppressed("0", null, true, inline)).toBe(true);
      expect(isTreemapTooltipSuppressed("0-0", null, true, inline)).toBe(true);
      expect(isTreemapTooltipSuppressed("0-3", null, true, inline)).toBe(true);
    });

    it("shows the tooltip when the top-level group header does not show the value+%", () => {
      // Group "1" header has no value+%, so its elements keep the tooltip even
      // though leaf "1-0" shows its own full block (different, sub-group info).
      expect(isTreemapTooltipSuppressed("1", null, true, inline)).toBe(false);
      expect(isTreemapTooltipSuppressed("1-0", null, true, inline)).toBe(false);
    });
  });

  describe("drilled into a group (viewRootId set)", () => {
    it("suppresses a hovered leaf that shows its own full block", () => {
      expect(isTreemapTooltipSuppressed("0-0", "0", true, inline)).toBe(true);
      expect(isTreemapTooltipSuppressed("0-3", "0", true, inline)).toBe(false);
    });
  });

  describe("1-level treemap (isTwoLevel false)", () => {
    it("suppresses a tile that shows its own full block, ignoring headers", () => {
      const ids = {
        fullLeafIds: new Set(["0", "2"]),
        valuePercentHeaderIds: new Set<string>(),
      };
      expect(isTreemapTooltipSuppressed("0", null, false, ids)).toBe(true);
      expect(isTreemapTooltipSuppressed("1", null, false, ids)).toBe(false);
    });
  });
});
