import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { getNodesFromPath } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getTreemapChartColumns, getTreemapData } from "./data";
import type { TreemapChartColumns, TreemapTree } from "./types";

const columns: DatasetColumn[] = [
  createMockColumn({
    name: "Category",
    display_name: "Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "Amount",
    display_name: "Amount",
    base_type: "type/Number",
    semantic_type: "type/Number",
  }),
];

const columnsWithSub: DatasetColumn[] = [
  createMockColumn({
    name: "Category",
    display_name: "Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "SubCategory",
    display_name: "Sub-Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "Amount",
    display_name: "Amount",
    base_type: "type/Number",
    semantic_type: "type/Number",
  }),
];

const treemapColumns: TreemapChartColumns = {
  grouping: { index: 0, column: columns[0] },
  value: { index: 1, column: columns[1] },
};

const treemapColumnsWithSub: TreemapChartColumns = {
  grouping: { index: 0, column: columnsWithSub[0] },
  subGrouping: { index: 1, column: columnsWithSub[1] },
  value: { index: 2, column: columnsWithSub[2] },
};

describe("getTreemapChartColumns", () => {
  it("returns null when treemap.grouping is missing", () => {
    expect(
      getTreemapChartColumns(columns, { "treemap.value": "Amount" }),
    ).toBeNull();
  });

  it("returns null when treemap.value is missing", () => {
    expect(
      getTreemapChartColumns(columns, { "treemap.grouping": "Category" }),
    ).toBeNull();
  });

  it("returns null when a referenced column is not present", () => {
    expect(
      getTreemapChartColumns(columns, {
        "treemap.grouping": "DoesNotExist",
        "treemap.value": "Amount",
      }),
    ).toBeNull();
  });

  it("returns descriptors for both columns when all settings present", () => {
    const result = getTreemapChartColumns(columns, {
      "treemap.grouping": "Category",
      "treemap.value": "Amount",
    });

    expect(result).toEqual({
      grouping: expect.objectContaining({ index: 0 }),
      value: expect.objectContaining({ index: 1 }),
    });
  });

  it("returns a subGrouping descriptor when treemap.sub_grouping is set", () => {
    const result = getTreemapChartColumns(columnsWithSub, {
      "treemap.grouping": "Category",
      "treemap.sub_grouping": "SubCategory",
      "treemap.value": "Amount",
    });

    expect(result).toEqual({
      grouping: expect.objectContaining({ index: 0 }),
      subGrouping: expect.objectContaining({ index: 1 }),
      value: expect.objectContaining({ index: 2 }),
    });
  });

  it("omits subGrouping when treemap.sub_grouping is unset", () => {
    const result = getTreemapChartColumns(columnsWithSub, {
      "treemap.grouping": "Category",
      "treemap.value": "Amount",
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("subGrouping");
  });

  it("silently falls back to 1-level when treemap.sub_grouping references a missing column", () => {
    const result = getTreemapChartColumns(columnsWithSub, {
      "treemap.grouping": "Category",
      "treemap.sub_grouping": "DoesNotExist",
      "treemap.value": "Amount",
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("subGrouping");
  });
});

describe("getTreemapData (1-level)", () => {
  function makeRawSeries(rows: RowValue[][]) {
    return [
      {
        card: createMockCard({ name: "Treemap card" }),
        data: createMockDatasetData({ rows, cols: columns }),
      },
    ];
  }

  it("returns an empty tree for an empty rowset", () => {
    expect(getTreemapData(makeRawSeries([]), treemapColumns)).toEqual([]);
  });

  it("builds one root node for a single row", () => {
    const result = getTreemapData(makeRawSeries([["A", 10]]), treemapColumns);

    expect(result).toEqual([
      {
        rawName: "A",
        displayName: "A",
        value: 10,
        rowIndices: [0],
      },
    ]);
  });

  it("creates one root node per unique grouping value", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", 10],
        ["B", 20],
        ["C", 30],
      ]),
      treemapColumns,
    );

    expect(result).toHaveLength(3);
    expect(result.map((n) => n.rawName)).toEqual(["A", "B", "C"]);
    expect(result.map((n) => n.value)).toEqual([10, 20, 30]);
  });

  it("sums duplicate grouping rows and tracks all row indices", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", 10],
        ["B", 20],
        ["A", 5],
        ["A", 1],
      ]),
      treemapColumns,
    );

    expect(result).toEqual([
      {
        rawName: "A",
        displayName: "A",
        value: 16,
        rowIndices: [0, 2, 3],
      },
      {
        rawName: "B",
        displayName: "B",
        value: 20,
        rowIndices: [1],
      },
    ]);
  });

  it("treats a null metric value as zero contribution", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", 10],
        ["A", null],
      ]),
      treemapColumns,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rawName: "A",
      value: 10,
      rowIndices: [0, 1],
    });
  });

  it("renders a null grouping value using the standard null display value", () => {
    const result = getTreemapData(
      makeRawSeries([
        [null, 7],
        ["A", 3],
      ]),
      treemapColumns,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      rawName: null,
      displayName: NULL_DISPLAY_VALUE,
      value: 7,
    });
  });

  it("uses the custom name from treemap.rows for a top-level node", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", 10],
        ["B", 20],
      ]),
      treemapColumns,
      [
        {
          key: "A",
          name: "Renamed A",
          originalName: "A",
          color: "#FF0000",
          defaultColor: false,
          hidden: false,
        },
      ],
    );

    expect(result.map((n) => n.displayName)).toEqual(["Renamed A", "B"]);
  });

  it("matches a null grouping value to its treemap.rows entry by null key", () => {
    const result = getTreemapData(
      makeRawSeries([[null, 7]]),
      treemapColumns,
      [
        {
          key: NULL_DISPLAY_VALUE,
          name: "No category",
          originalName: NULL_DISPLAY_VALUE,
          color: "#FF0000",
          defaultColor: false,
          hidden: false,
        },
      ],
    );

    expect(result[0].displayName).toBe("No category");
  });
});

describe("getTreemapData (2-level)", () => {
  function makeRawSeries(rows: RowValue[][]) {
    return [
      {
        card: createMockCard({ name: "Treemap card" }),
        data: createMockDatasetData({ rows, cols: columnsWithSub }),
      },
    ];
  }

  it("returns an empty tree for an empty rowset", () => {
    expect(getTreemapData(makeRawSeries([]), treemapColumnsWithSub)).toEqual(
      [],
    );
  });

  it("builds one leaf per (grouping, sub-grouping) pair under each root", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", "x", 10],
        ["A", "y", 5],
        ["B", "x", 20],
      ]),
      treemapColumnsWithSub,
    );

    expect(result).toEqual([
      {
        rawName: "A",
        displayName: "A",
        value: 15,
        rowIndices: [0, 1],
        children: [
          {
            rawName: "x",
            displayName: "x",
            value: 10,
            rowIndices: [0],
          },
          {
            rawName: "y",
            displayName: "y",
            value: 5,
            rowIndices: [1],
          },
        ],
      },
      {
        rawName: "B",
        displayName: "B",
        value: 20,
        rowIndices: [2],
        children: [
          {
            rawName: "x",
            displayName: "x",
            value: 20,
            rowIndices: [2],
          },
        ],
      },
    ]);
  });

  it("sets root value as the sum of its children's values", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", "x", 3],
        ["A", "y", 4],
        ["A", "z", 5],
      ]),
      treemapColumnsWithSub,
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(12);
    expect(result[0].children?.map((c) => c.value)).toEqual([3, 4, 5]);
  });

  it("sums duplicate (grouping, sub-grouping) pairs into a single leaf", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", "x", 10],
        ["A", "x", 3],
        ["A", "y", 2],
        ["A", "x", 1],
      ]),
      treemapColumnsWithSub,
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(16);
    expect(result[0].children).toEqual([
      {
        rawName: "x",
        displayName: "x",
        value: 14,
        rowIndices: [0, 1, 3],
      },
      {
        rawName: "y",
        displayName: "y",
        value: 2,
        rowIndices: [2],
      },
    ]);
  });

  it("renders null sub-grouping as a leaf using the standard null display value", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", "x", 10],
        ["A", null, 4],
      ]),
      treemapColumnsWithSub,
    );

    expect(result).toHaveLength(1);
    expect(result[0].children).toEqual([
      {
        rawName: "x",
        displayName: "x",
        value: 10,
        rowIndices: [0],
      },
      {
        rawName: null,
        displayName: NULL_DISPLAY_VALUE,
        value: 4,
        rowIndices: [1],
      },
    ]);
  });

  it("aggregates duplicate null sub-grouping rows into a single (null) leaf", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", null, 4],
        ["A", "x", 10],
        ["A", null, 6],
      ]),
      treemapColumnsWithSub,
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(20);
    expect(result[0].children).toEqual([
      {
        rawName: null,
        displayName: NULL_DISPLAY_VALUE,
        value: 10,
        rowIndices: [0, 2],
      },
      {
        rawName: "x",
        displayName: "x",
        value: 10,
        rowIndices: [1],
      },
    ]);
  });

  it("accumulates rowIndices on the root across all of its leaves", () => {
    const result = getTreemapData(
      makeRawSeries([
        ["A", "x", 10],
        ["B", "x", 1],
        ["A", "y", 4],
        ["A", "x", 2],
      ]),
      treemapColumnsWithSub,
    );

    expect(result.find((n) => n.rawName === "A")?.rowIndices).toEqual([
      0, 2, 3,
    ]);
    expect(result.find((n) => n.rawName === "B")?.rowIndices).toEqual([1]);
  });
});

describe("getNodesFromPath", () => {
  const tree: TreemapTree = [
    {
      rawName: "Legumes",
      displayName: "Legumes",
      value: 30,
      rowIndices: [],
      children: [
        {
          rawName: "Chickpeas",
          displayName: "Chickpeas",
          value: 20,
          rowIndices: [],
        },
        {
          rawName: "Lentils",
          displayName: "Lentils",
          value: 10,
          rowIndices: [],
        },
      ],
    },
    { rawName: "Grains", displayName: "Grains", value: 5, rowIndices: [] },
  ];

  it("resolves a top-level node id to a single-node path", () => {
    expect(getNodesFromPath(tree, "1")).toEqual([tree[1]]);
  });

  it("resolves a leaf id to the grouping → leaf path", () => {
    expect(getNodesFromPath(tree, "0-1")).toEqual([
      tree[0],
      tree[0].children?.[1],
    ]);
  });

  it("returns null for an out-of-range segment", () => {
    expect(getNodesFromPath(tree, "5")).toBeNull();
    expect(getNodesFromPath(tree, "0-9")).toBeNull();
    expect(getNodesFromPath(tree, "1-0")).toBeNull(); // Grains has no children
  });
});
