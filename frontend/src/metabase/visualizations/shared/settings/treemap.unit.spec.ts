import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries, RowValue, TreemapRow } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { getTreemapRows } from "./treemap";

const columns = [
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

function createRawSeries(rows: RowValue[][]): RawSeries {
  return [
    {
      card: createMockCard({ display: "treemap" }),
      data: createMockDatasetData({ cols: columns, rows }),
    },
  ];
}

function createSettings(
  savedRows?: TreemapRow[],
): ComputedVisualizationSettings {
  return {
    "treemap.grouping": "Category",
    "treemap.value": "Amount",
    "treemap.rows": savedRows,
    column: () => ({}),
  };
}

const formatter = (value: RowValue) => String(value);

describe("getTreemapRows", () => {
  it("keeps a group disabled via the X across recomputes", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 30],
    ]);
    const saved: TreemapRow = {
      key: "Phones",
      name: "Phones",
      originalName: "Phones",
      color: "#509EE3",
      defaultColor: true,
      enabled: false,
      hidden: false,
    };
    const rows = getTreemapRows(rawSeries, createSettings([saved]), formatter);

    expect(rows.find((row) => row.key === "Phones")).toMatchObject({
      enabled: false,
      hidden: false,
    });
  });
});
