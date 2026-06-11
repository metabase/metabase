import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
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
  it("returns empty array when columns are not set", () => {
    const rawSeries = createRawSeries([["Phones", 10]]);
    expect(getTreemapRows(rawSeries, {}, formatter)).toEqual([]);
  });

  it("creates one row per distinct grouping value, sorted by value descending", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 30],
      ["Tablets", 20],
    ]);
    const rows = getTreemapRows(rawSeries, createSettings(), formatter);

    expect(rows.map((row) => row.key)).toEqual([
      "Laptops",
      "Tablets",
      "Phones",
    ]);
    rows.forEach((row) => {
      expect(row.name).toBe(row.key);
      expect(row.originalName).toBe(row.key);
      expect(row.defaultColor).toBe(true);
      expect(row.enabled).toBe(true);
      expect(typeof row.color).toBe("string");
    });
  });

  it("treats saved rows without an enabled field as enabled (legacy settings)", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 30],
    ]);
    // Rows persisted before the remove-group feature existed have no
    // `enabled` field at all.
    const legacy = {
      key: "Phones",
      name: "Smartphones",
      originalName: "Phones",
      color: "#FF0000",
      defaultColor: false,
      hidden: false,
    } as TreemapRow;
    const rows = getTreemapRows(rawSeries, createSettings([legacy]), formatter);

    expect(rows.find((row) => row.key === "Phones")).toMatchObject({
      name: "Smartphones",
      enabled: true,
    });
  });

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

  it("aggregates duplicate grouping values before sorting", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 15],
      ["Phones", 10],
    ]);
    const rows = getTreemapRows(rawSeries, createSettings(), formatter);

    expect(rows.map((row) => row.key)).toEqual(["Phones", "Laptops"]);
  });

  it("keys null grouping values as NULL_DISPLAY_VALUE", () => {
    const rawSeries = createRawSeries([
      [null, 20],
      ["Phones", 10],
    ]);
    const rows = getTreemapRows(rawSeries, createSettings(), formatter);

    expect(rows[0].key).toBe(NULL_DISPLAY_VALUE);
    expect(rows[0].name).toBe(NULL_DISPLAY_VALUE);
  });

  it("keeps a saved custom name and color", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 30],
    ]);
    const saved: TreemapRow = {
      key: "Phones",
      name: "Smartphones",
      originalName: "Phones",
      color: "#FF0000",
      defaultColor: false,
      enabled: true,
      hidden: false,
    };
    const rows = getTreemapRows(rawSeries, createSettings([saved]), formatter);

    const phones = rows.find((row) => row.key === "Phones");
    expect(phones).toMatchObject({
      name: "Smartphones",
      color: "#FF0000",
      defaultColor: false,
      enabled: true,
      hidden: false,
    });
  });

  it("refreshes the color from the palette while defaultColor is true", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 30],
    ]);
    const saved: TreemapRow = {
      key: "Phones",
      name: "Smartphones",
      originalName: "Phones",
      color: "#STALE",
      defaultColor: true,
      enabled: true,
      hidden: false,
    };
    const rows = getTreemapRows(rawSeries, createSettings([saved]), formatter);
    const freshRows = getTreemapRows(rawSeries, createSettings(), formatter);

    const phones = rows.find((row) => row.key === "Phones");
    const freshPhones = freshRows.find((row) => row.key === "Phones");
    expect(phones?.name).toBe("Smartphones");
    expect(phones?.color).toBe(freshPhones?.color);
  });

  it("retains saved rows whose key is no longer in the data at the end", () => {
    const rawSeries = createRawSeries([["Phones", 10]]);
    const saved: TreemapRow = {
      key: "Discontinued",
      name: "Old stuff",
      originalName: "Discontinued",
      color: "#FF0000",
      defaultColor: false,
      enabled: true,
      hidden: false,
    };
    const rows = getTreemapRows(rawSeries, createSettings([saved]), formatter);

    expect(rows.map((row) => row.key)).toEqual(["Phones", "Discontinued"]);
    expect(rows[1]).toEqual({ ...saved, hidden: true });
  });

  it("un-hides a retained row when its key reappears in the data", () => {
    const saved: TreemapRow = {
      key: "Phones",
      name: "Smartphones",
      originalName: "Phones",
      color: "#FF0000",
      defaultColor: false,
      enabled: true,
      hidden: true,
    };
    const rows = getTreemapRows(
      createRawSeries([["Phones", 10]]),
      createSettings([saved]),
      formatter,
    );

    expect(rows[0]).toMatchObject({
      key: "Phones",
      name: "Smartphones",
      hidden: false,
    });
  });

  it("assigns stable colors for the same data regardless of saved rows", () => {
    const rawSeries = createRawSeries([
      ["Phones", 10],
      ["Laptops", 30],
    ]);
    const first = getTreemapRows(rawSeries, createSettings(), formatter);
    const second = getTreemapRows(rawSeries, createSettings(first), formatter);

    expect(second).toEqual(first);
  });
});
