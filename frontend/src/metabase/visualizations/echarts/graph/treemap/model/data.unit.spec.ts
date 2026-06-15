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

const columnsWithNumericSub: DatasetColumn[] = [
  createMockColumn({
    name: "Category",
    display_name: "Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "SubAmount",
    display_name: "Sub-Amount",
    base_type: "type/Number",
    semantic_type: "type/Number",
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

const treemapColumnsWithNumericSub: TreemapChartColumns = {
  grouping: { index: 0, column: columnsWithNumericSub[0] },
  subGrouping: { index: 1, column: columnsWithNumericSub[1] },
  value: { index: 2, column: columnsWithNumericSub[2] },
};

function makeRawSeries1Level(rows: RowValue[][]) {
  return [
    {
      card: createMockCard({ name: "Treemap card" }),
      data: createMockDatasetData({ rows, cols: columns }),
    },
  ];
}

function makeRawSeries2Level(rows: RowValue[][]) {
  return [
    {
      card: createMockCard({ name: "Treemap card" }),
      data: createMockDatasetData({ rows, cols: columnsWithSub }),
    },
  ];
}

function makeRawSeries2LevelWithNumericSub(rows: RowValue[][]) {
  return [
    {
      card: createMockCard({ name: "Treemap card" }),
      data: createMockDatasetData({ rows, cols: columnsWithNumericSub }),
    },
  ];
}

describe("treemap data model", () => {
  it("resolves columns and falls back when sub-grouping is invalid", () => {
    expect(
      getTreemapChartColumns(columns, {
        "treemap.grouping": "Category",
      }),
    ).toBeNull();

    expect(
      getTreemapChartColumns(columns, {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
      }),
    ).toEqual({
      grouping: expect.objectContaining({ index: 0 }),
      value: expect.objectContaining({ index: 1 }),
    });

    expect(
      getTreemapChartColumns(columnsWithSub, {
        "treemap.grouping": "Category",
        "treemap.sub_grouping": "SubCategory",
        "treemap.value": "Amount",
      }),
    ).toEqual({
      grouping: expect.objectContaining({ index: 0 }),
      subGrouping: expect.objectContaining({ index: 1 }),
      value: expect.objectContaining({ index: 2 }),
    });

    expect(
      getTreemapChartColumns(columnsWithSub, {
        "treemap.grouping": "Category",
        "treemap.sub_grouping": "DoesNotExist",
        "treemap.value": "Amount",
      }),
    ).toEqual({
      grouping: expect.objectContaining({ index: 0 }),
      value: expect.objectContaining({ index: 2 }),
    });
  });

  it("builds a 1-level tree with aggregation and treemap.rows behavior", () => {
    const result = getTreemapData(
      makeRawSeries1Level([
        [null, 7],
        ["A", 10],
        ["A", null],
        ["B", 20],
      ]),
      treemapColumns,
      [
        {
          key: NULL_DISPLAY_VALUE,
          name: "No category",
          originalName: NULL_DISPLAY_VALUE,
          color: "#FF0000",
          defaultColor: false,
          enabled: true,
          hidden: false,
        },
        {
          key: "A",
          name: "Renamed A",
          originalName: "A",
          color: "#00FF00",
          defaultColor: false,
          enabled: true,
          hidden: false,
        },
        {
          key: "B",
          name: "B",
          originalName: "B",
          color: "#0000FF",
          defaultColor: true,
          enabled: false,
          hidden: false,
        },
      ],
    );

    expect(result).toEqual([
      {
        rawName: null,
        displayName: "No category",
        value: 7,
        rowIndices: [0],
      },
      {
        rawName: "A",
        displayName: "Renamed A",
        value: 10,
        rowIndices: [1, 2],
      },
    ]);
  });

  it("builds a 2-level tree with duplicate and null sub-grouping aggregation", () => {
    const result = getTreemapData(
      makeRawSeries2Level([
        ["A", "x", 10],
        ["A", null, 4],
        ["A", "x", 3],
        ["B", "x", 2],
      ]),
      treemapColumnsWithSub,
    );

    expect(result).toEqual([
      {
        rawName: "A",
        displayName: "A",
        value: 17,
        rowIndices: [0, 1, 2],
        children: [
          {
            rawName: "x",
            displayName: "x",
            value: 13,
            rowIndices: [0, 2],
          },
          {
            rawName: null,
            displayName: NULL_DISPLAY_VALUE,
            value: 4,
            rowIndices: [1],
          },
        ],
      },
      {
        rawName: "B",
        displayName: "B",
        value: 2,
        rowIndices: [3],
        children: [
          {
            rawName: "x",
            displayName: "x",
            value: 2,
            rowIndices: [3],
          },
        ],
      },
    ]);
  });

  it("formats 2-level sub-grouping leaf display names from column settings", () => {
    const result = getTreemapData(
      makeRawSeries2LevelWithNumericSub([
        ["A", 1000, 1],
        ["A", 2500, 2],
      ]),
      treemapColumnsWithNumericSub,
      undefined,
      {
        column: (column) =>
          column.name === "SubAmount" ? { prefix: "$" } : {},
      },
    );

    expect(result).toMatchObject([
      {
        rawName: "A",
        value: 3,
        rowIndices: [0, 1],
        children: [
          {
            rawName: 1000,
            displayName: "$1,000",
            value: 1,
            rowIndices: [0],
          },
          {
            rawName: 2500,
            displayName: "$2,500",
            value: 2,
            rowIndices: [1],
          },
        ],
      },
    ]);
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

  it("resolves top-level and leaf paths, and rejects invalid ids", () => {
    expect(getNodesFromPath(tree, "1")).toEqual([tree[1]]);
    expect(getNodesFromPath(tree, "0-1")).toEqual([
      tree[0],
      tree[0].children?.[1],
    ]);

    expect(getNodesFromPath(tree, "5")).toBeNull();
    expect(getNodesFromPath(tree, "0-9")).toBeNull();
    expect(getNodesFromPath(tree, "1-0")).toBeNull();
  });
});
