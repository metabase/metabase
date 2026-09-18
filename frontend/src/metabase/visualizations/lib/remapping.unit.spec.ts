import { extractRemappedColumns } from "metabase/visualizations";
import type { DatasetColumn, DatasetData } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const remappedCategoryData = (): DatasetData =>
  createMockDatasetData({
    cols: [
      createMockColumn({
        name: "category_id",
        display_name: "Category ID",
        base_type: "type/Integer",
        semantic_type: "type/Category",
        remapped_to: "Category label",
      }),
      createMockColumn({
        name: "team",
        display_name: "Team",
        base_type: "type/Text",
      }),
      createMockColumn({
        name: "sum",
        display_name: "Sum",
        base_type: "type/Float",
        semantic_type: "type/Number",
      }),
      createMockColumn({
        name: "Category label",
        display_name: "Category label",
        base_type: "type/Text",
        remapped_from: "category_id",
      }),
    ],
    rows: [
      [1, "Team A", 10, "Type A"],
      [1, "Team B", 20, "Type A"],
      [2, "Team C", 30, "Type B"],
      [2, "Team D", 40, "Type B"],
    ],
  });

describe("extractRemappedColumns", () => {
  it("folds the companion column into a remapping Map and drops it", () => {
    const result = extractRemappedColumns(remappedCategoryData());

    expect(result.cols.map((col) => col.name)).toEqual([
      "category_id",
      "team",
      "sum",
    ]);
    expect(result.rows).toEqual([
      [1, "Team A", 10],
      [1, "Team B", 20],
      [2, "Team C", 30],
      [2, "Team D", 40],
    ]);
    expect(result.cols[0]?.remapping).toEqual(
      new Map([
        [1, "Type A"],
        [2, "Type B"],
      ]),
    );
  });

  it("preserves an existing remapping when called a second time", () => {
    const first = extractRemappedColumns(remappedCategoryData());
    const second = extractRemappedColumns(first);

    expect(second.cols.map((col) => col.name)).toEqual([
      "category_id",
      "team",
      "sum",
    ]);
    expect(second.cols[0]?.remapping).toEqual(
      new Map([
        [1, "Type A"],
        [2, "Type B"],
      ]),
    );
  });

  it("does not throw when remapping is a JSON-serialized empty object", () => {
    const data = remappedCategoryData();
    data.cols[0] = createMockColumn({
      ...data.cols[0],
      // JSON.stringify(Map) is always {}; storybook/loki fixtures have this shape
      remapping: {} as DatasetColumn["remapping"],
    });

    expect(() => extractRemappedColumns(data)).not.toThrow();
  });

  it("does not mutate the input column's remapping Map", () => {
    const existingRemapping = new Map([[1, "Type A"]]);
    const data = remappedCategoryData();
    data.cols[0] = createMockColumn({
      ...data.cols[0],
      remapping: existingRemapping,
    });

    const result = extractRemappedColumns(data);

    expect(existingRemapping).toEqual(new Map([[1, "Type A"]]));
    expect(result.cols[0]?.remapping).not.toBe(existingRemapping);
    expect(result.cols[0]?.remapping).toEqual(
      new Map([
        [1, "Type A"],
        [2, "Type B"],
      ]),
    );
  });

  it("leaves columns without remapped_to unchanged", () => {
    const data = createMockDatasetData({
      cols: [
        createMockColumn({ name: "team", base_type: "type/Text" }),
        createMockColumn({
          name: "sum",
          base_type: "type/Float",
          semantic_type: "type/Number",
        }),
      ],
      rows: [
        ["Team A", 10],
        ["Team B", 20],
      ],
    });

    const result = extractRemappedColumns(data);

    expect(result.cols.map((col) => col.name)).toEqual(["team", "sum"]);
    expect(result.cols[0]?.remapping).toBeUndefined();
    expect(result.rows).toEqual(data.rows);
  });
});
