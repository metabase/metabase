import type {
  FieldRefColumnSplitSetting,
  FieldReference,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { migratePivotColumnSplitSetting } from "./pivot";

describe("migratePivotColumnSplitSetting", () => {
  it("should return a column-name setting unchanged", () => {
    const rowColumn = createMockColumn({
      name: "CATEGORY",
      field_ref: ["field", 1, null],
    });
    const columnColumn = createMockColumn({
      name: "CREATED_AT",
      field_ref: ["field", 2, null],
    });
    const valueColumn = createMockColumn({
      name: "COUNT",
      field_ref: ["aggregation", 0],
    });
    const setting = {
      rows: ["CATEGORY"],
      columns: ["CREATED_AT"],
      values: ["COUNT"],
    };
    expect(
      migratePivotColumnSplitSetting(setting, [
        rowColumn,
        columnColumn,
        valueColumn,
      ]),
    ).toEqual(setting);
  });

  it("should migrate matching field refs to column names", () => {
    const rowColumn = createMockColumn({
      name: "CATEGORY",
      field_ref: ["field", 1, null],
    });
    const columnColumn = createMockColumn({
      name: "CREATED_AT",
      field_ref: ["field", 2, null],
    });
    const valueColumn = createMockColumn({
      name: "COUNT",
      field_ref: ["aggregation", 0],
    });
    const setting: FieldRefColumnSplitSetting = {
      rows: [["field", 1, null]],
      columns: [["field", 2, null]],
      values: [["aggregation", 0]],
    };
    expect(
      migratePivotColumnSplitSetting(setting, [
        rowColumn,
        columnColumn,
        valueColumn,
      ]),
    ).toEqual({
      rows: ["CATEGORY"],
      columns: ["CREATED_AT"],
      values: ["COUNT"],
    });
  });

  it("should drop field refs that do not match any column", () => {
    const rowColumn = createMockColumn({
      name: "CATEGORY",
      field_ref: ["field", 1, null],
    });
    const columnColumn = createMockColumn({
      name: "CREATED_AT",
      field_ref: ["field", 2, null],
    });
    const setting: FieldRefColumnSplitSetting = {
      rows: [["field", 999, null]],
      columns: [["field", 2, null]],
      values: [],
    };
    expect(
      migratePivotColumnSplitSetting(setting, [rowColumn, columnColumn]),
    ).toEqual({
      rows: [],
      columns: ["CREATED_AT"],
      values: [],
    });
  });

  it("should drop null field refs", () => {
    const rowColumn = createMockColumn({
      name: "CATEGORY",
      field_ref: ["field", 1, null],
    });
    const setting: FieldRefColumnSplitSetting = {
      rows: [null, ["field", 1, null]],
      columns: [],
      values: [],
    };
    expect(migratePivotColumnSplitSetting(setting, [rowColumn])).toEqual({
      rows: ["CATEGORY"],
      columns: [],
      values: [],
    });
  });

  describe("base-type mismatch between settings and columns", () => {
    it("should match when the setting field ref has base-type and the column field ref has null options", () => {
      const column = createMockColumn({
        name: "CATEGORY",
        field_ref: ["field", 1, null],
      });
      const setting: FieldRefColumnSplitSetting = {
        rows: [["field", 1, { "base-type": "type/Text" }] as FieldReference],
        columns: [],
        values: [],
      };
      expect(migratePivotColumnSplitSetting(setting, [column])).toEqual({
        rows: ["CATEGORY"],
        columns: [],
        values: [],
      });
    });

    it("should match when the setting field ref has base-type and the column field ref has empty options", () => {
      const column = createMockColumn({
        name: "CATEGORY",
        field_ref: ["field", 1, {}],
      });
      const setting: FieldRefColumnSplitSetting = {
        rows: [["field", 1, { "base-type": "type/Text" }] as FieldReference],
        columns: [],
        values: [],
      };
      expect(migratePivotColumnSplitSetting(setting, [column])).toEqual({
        rows: ["CATEGORY"],
        columns: [],
        values: [],
      });
    });

    it("should match when the setting field ref has null options and the column field ref has base-type", () => {
      const column = createMockColumn({
        name: "CATEGORY",
        field_ref: ["field", 1, { "base-type": "type/Text" }],
      });
      const setting: FieldRefColumnSplitSetting = {
        rows: [["field", 1, null]],
        columns: [],
        values: [],
      };
      expect(migratePivotColumnSplitSetting(setting, [column])).toEqual({
        rows: ["CATEGORY"],
        columns: [],
        values: [],
      });
    });

    it("should match when the setting field ref has empty options and the column field ref has base-type", () => {
      const column = createMockColumn({
        name: "CATEGORY",
        field_ref: ["field", 1, { "base-type": "type/Text" }],
      });
      const setting: FieldRefColumnSplitSetting = {
        rows: [["field", 1, {}]],
        columns: [],
        values: [],
      };
      expect(migratePivotColumnSplitSetting(setting, [column])).toEqual({
        rows: ["CATEGORY"],
        columns: [],
        values: [],
      });
    });
  });
});
