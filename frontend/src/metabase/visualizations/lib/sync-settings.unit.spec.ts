import type {
  DatasetColumn,
  TableColumnOrderSetting,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { syncVizSettingsWithSeries } from "./sync-settings";

const columns: DatasetColumn[] = [
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

const vizSettingColumns: TableColumnOrderSetting[] = columns.map(column => ({
  name: column.name,
  fieldRef: column.field_ref,
  enabled: true,
}));

const noVizSettings: VisualizationSettings = {};
const vizSettings: VisualizationSettings = {
  "table.columns": vizSettingColumns,
};

function createSeries({
  cols = columns,
  settings = vizSettings,
}: { cols?: DatasetColumn[]; settings?: VisualizationSettings } = {}) {
  return [
    createMockSingleSeries(
      { visualization_settings: settings },
      { data: { cols, rows: [] } },
    ),
  ];
}

describe("syncVizSettingsWithSeries", () => {
  describe("when 'table.columns' setting is not defined", () => {
    it("should do nothing when given empty query results", () => {
      const series = [
        createMockSingleSeries(
          { visualization_settings: noVizSettings },
          { error: { status: 500 }, data: { cols: [], rows: [] } },
        ),
      ];
      const syncedSettings = syncVizSettingsWithSeries(noVizSettings, series);
      expect(syncedSettings).toEqual({});
    });

    it("should do nothing when given query results with no columns", () => {
      const series = createSeries({ settings: noVizSettings, cols: [] });
      const syncedSettings = syncVizSettingsWithSeries(noVizSettings, series);
      expect(syncedSettings).toEqual({});
    });

    it("should do nothing when given query results with columns", () => {
      const series = createSeries({ settings: noVizSettings, cols: columns });
      const syncedSettings = syncVizSettingsWithSeries(noVizSettings, series);
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
      const series = createSeries({ cols: [...columns.slice(1), addedColumn] });

      const syncedSettings = syncVizSettingsWithSeries(vizSettings, series);

      expect(syncedSettings).toEqual({
        "table.columns": [
          ...vizSettingColumns.slice(1),
          {
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
      const series = createSeries({
        cols: [updatedColumn, ...columns.slice(1)],
      });

      const syncedSettings = syncVizSettingsWithSeries(vizSettings, series);

      expect(syncedSettings).toEqual({
        "table.columns": [
          ...vizSettingColumns.slice(1),
          {
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
      const series = createSeries({
        cols: [updatedColumn, ...columns.slice(1)],
      });

      const syncedSettings = syncVizSettingsWithSeries(vizSettings, series);

      expect(syncedSettings).toEqual({
        "table.columns": [
          ...vizSettingColumns.slice(1),
          {
            name: updatedColumn.name,
            fieldRef: updatedColumn.field_ref,
            enabled: true,
          },
        ],
      });
    });

    it("shouldn't update settings if order of columns has changed", () => {
      const series = createSeries({ cols: [columns[1], columns[0]] });
      const syncedSettings = syncVizSettingsWithSeries(vizSettings, series);
      expect(syncedSettings).toEqual(vizSettings);
    });

    it("should handle name changes when a column with a duplicate name is added and ids are available", () => {
      const series = createSeries({
        cols: [
          createMockColumn({ id: 1, name: "ID" }),
          createMockColumn({ id: 2, name: "ID_2" }),
          createMockColumn({ id: 3, name: "ID_3" }),
        ],
      });
      const prevSeries = createSeries({
        cols: [
          createMockColumn({ id: 1, name: "ID" }),
          createMockColumn({ id: 3, name: "ID_2" }),
        ],
      });
      const vizSettings: VisualizationSettings = {
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
        ],
      };
      const newVizSettings = syncVizSettingsWithSeries(
        vizSettings,
        series,
        prevSeries,
      );
      expect(newVizSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_3", enabled: false },
          { name: "ID_2", enabled: true },
        ],
      });
    });

    it("should not make name changes when a column with a duplicate name is added and ids are not available", () => {
      const series = createSeries({
        cols: [
          createMockColumn({ id: undefined, name: "ID" }),
          createMockColumn({ id: undefined, name: "ID_2" }),
          createMockColumn({ id: undefined, name: "ID_3" }),
        ],
      });
      const prevSeries = createSeries({
        cols: [
          createMockColumn({ id: undefined, name: "ID" }),
          createMockColumn({ id: undefined, name: "ID_2" }),
        ],
      });
      const vizSettings: VisualizationSettings = {
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
        ],
      };
      const newVizSettings = syncVizSettingsWithSeries(
        vizSettings,
        series,
        prevSeries,
      );
      expect(newVizSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
          { name: "ID_3", enabled: true },
        ],
      });
    });

    it("should not make name changes when there are multiple columns with the same id", () => {
      const series = createSeries({
        cols: [
          createMockColumn({ id: 1, name: "ID" }),
          createMockColumn({ id: 2, name: "ID_2" }),
          createMockColumn({ id: 1, name: "ID_3" }),
        ],
      });
      const prevSeries = createSeries({
        cols: [
          createMockColumn({ id: 1, name: "ID" }),
          createMockColumn({ id: 2, name: "ID_2" }),
        ],
      });
      const vizSettings: VisualizationSettings = {
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
        ],
      };
      const newVizSettings = syncVizSettingsWithSeries(
        vizSettings,
        series,
        prevSeries,
      );
      expect(newVizSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
          { name: "ID_3", enabled: true },
        ],
      });
    });
  });
});
