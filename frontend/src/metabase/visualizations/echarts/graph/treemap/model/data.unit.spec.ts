import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getTreemapChartColumns, getTreemapData } from "./data";
import type { TreemapChartColumns } from "./types";

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

const treemapColumns: TreemapChartColumns = {
  grouping: { index: 0, column: columns[0] },
  value: { index: 1, column: columns[1] },
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

  it("preserves null grouping values on the node and stringifies the display name", () => {
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
      displayName: "",
      value: 7,
    });
  });
});
