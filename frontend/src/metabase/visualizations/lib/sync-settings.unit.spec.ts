import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";

import { syncVizSettingsWithQueryResults } from "./sync-settings";

const cols: DatasetColumn[] = [
  {
    display_name: "num",
    source: "native",
    field_ref: [
      "field",
      "num",
      {
        "base-type": "type/Float",
      },
    ],
    name: "num",
    base_type: "type/Float",
  },
  {
    display_name: "text",
    source: "native",
    field_ref: [
      "field",
      "text",
      {
        "base-type": "type/Text",
      },
    ],
    name: "text",
    base_type: "type/Text",
  },
];

const vizSettingColumns: TableColumnOrderSetting[] = cols.map(column => ({
  key: getColumnKey(column),
  name: column.name,
  fieldRef: column.field_ref,
  enabled: true,
}));

const noVizSettings = {};
const vizSettings = {
  "table.columns": vizSettingColumns,
};

describe("syncVizSettingsWithQueryResults", () => {
  describe("when 'table.columns' setting is not defined", () => {
    it("should do nothing when given empty query results", () => {
      const queryResults = createMockDataset({
        error: { status: 500 },
        data: { cols: [], rows: [] },
      });
      const syncedSettings = syncVizSettingsWithQueryResults(
        noVizSettings,
        queryResults,
      );
      expect(syncedSettings).toEqual({});
    });

    it("should do nothing when given query results with no columns", () => {
      const queryResults = createMockDataset({ data: { cols: [], rows: [] } });
      const syncedSettings = syncVizSettingsWithQueryResults(
        noVizSettings,
        queryResults,
      );
      expect(syncedSettings).toEqual({});
    });

    it("should do nothing when given query results with columns", () => {
      const queryResults = createMockDataset({ data: { cols } });
      const syncedSettings = syncVizSettingsWithQueryResults(
        noVizSettings,
        queryResults,
      );
      expect(syncedSettings).toEqual({});
    });
  });

  describe("when 'table.columns' setting is defined", () => {
    // Adding a column with same name is covered as well,
    // as name is generated at FE and it will be unique (e.g. foo -> foo_2)
    it("should handle the addition and removal of columns", () => {
      const addedColumn: DatasetColumn = {
        name: "foo",
        display_name: "foo",
        source: "native",
        field_ref: [
          "field",
          "foo",
          {
            "base-type": "type/Float",
          },
        ],
        base_type: "type/Float",
      };
      const queryResults = createMockDataset({
        data: { cols: [...cols.slice(1), addedColumn] },
      });

      const syncedSettings = syncVizSettingsWithQueryResults(
        vizSettings,
        queryResults,
      );

      expect(syncedSettings).toEqual({
        "table.columns": [
          ...vizSettings["table.columns"].slice(1),
          {
            key: getColumnKey(addedColumn),
            name: addedColumn.name,
            fieldRef: addedColumn.field_ref,
            enabled: true,
          },
        ],
      });
    });

    it("should handle extraneous column props mutation", () => {
      const updatedColumn: DatasetColumn = {
        display_name: "num with mutated display_name",
        source: "native",
        field_ref: [
          "field",
          "foo",
          {
            "base-type": "type/Float",
          },
        ],
        name: "foo",
        base_type: "type/Float",
      };
      const queryResults = createMockDataset({
        data: { cols: [updatedColumn, ...cols.slice(1)] },
      });

      const syncedSettings = syncVizSettingsWithQueryResults(
        vizSettings,
        queryResults,
      );

      expect(syncedSettings).toEqual({
        "table.columns": [
          ...vizSettings["table.columns"].slice(1),
          {
            key: getColumnKey(updatedColumn),
            name: updatedColumn.name,
            fieldRef: updatedColumn.field_ref,
            enabled: true,
          },
        ],
      });
    });

    it("should handle existing column's field_ref mutation", () => {
      const updatedColumn: DatasetColumn = {
        name: "foo",
        display_name: "foo",
        source: "native",
        field_ref: [
          "field",
          "foo",
          {
            "base-type": "type/Integer",
          },
        ],
        base_type: "type/Integer",
      };
      const queryResults = createMockDataset({
        data: { cols: [updatedColumn, ...cols.slice(1)] },
      });

      const syncedSettings = syncVizSettingsWithQueryResults(
        vizSettings,
        queryResults,
      );

      expect(syncedSettings).toEqual({
        "table.columns": [
          ...vizSettings["table.columns"].slice(1),
          {
            key: getColumnKey(updatedColumn),
            name: updatedColumn.name,
            fieldRef: updatedColumn.field_ref,
            enabled: true,
          },
        ],
      });
    });

    it("shouldn't update settings if order of columns has changed", () => {
      const queryResults = createMockDataset({
        data: { cols: [cols[1], cols[0]] },
      });

      const syncedSettings = syncVizSettingsWithQueryResults(
        vizSettings,
        queryResults,
      );

      expect(syncedSettings).toEqual(vizSettings);
    });
  });
});
