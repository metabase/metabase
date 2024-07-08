import {
  createMockTableColumnOrderSetting,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { syncVizSettings, type ColumnInfo } from "./sync-viz-settings";

describe("syncVizSettings", () => {
  describe("table.columns", () => {
    it("should not update the setting if there are no columns", () => {
      const oldSettings = createMockVisualizationSettings({
        "table.columns": [
          createMockTableColumnOrderSetting({
            name: "ID",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "ID_2",
            enabled: false,
          }),
        ],
      });

      const newSettings = syncVizSettings(oldSettings, undefined, undefined);
      expect(newSettings).toEqual(oldSettings);
    });

    it("should not update the setting if the order of columns has changed", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", desiredColumnAlias: "ID" },
        { name: "ID_2", desiredColumnAlias: "PEOPLE__ID" },
      ];

      const newColumns: ColumnInfo[] = [oldColumns[1], oldColumns[0]];

      const oldSettings = createMockVisualizationSettings({
        "table.columns": [
          createMockTableColumnOrderSetting({
            name: "ID",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "ID_2",
            enabled: false,
          }),
        ],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual(oldSettings);
    });

    it("should handle adding new columns with column.name changes", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", desiredColumnAlias: "ID" },
        { name: "ID_2", desiredColumnAlias: "PEOPLE__ID" },
      ];

      const newColumns: ColumnInfo[] = [
        { name: "ID", desiredColumnAlias: "ID" },
        { name: "ID_2", desiredColumnAlias: "PRODUCTS__ID" },
        { name: "ID_3", desiredColumnAlias: "PEOPLE__ID" },
      ];

      const oldSettings = createMockVisualizationSettings({
        "table.columns": [
          createMockTableColumnOrderSetting({
            name: "ID",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "ID_2",
            enabled: false,
          }),
        ],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_3", enabled: false },
          { name: "ID_2", enabled: true },
        ],
      });
    });

    it("should handle removing columns with column.name changes", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", desiredColumnAlias: "ID" },
        { name: "TOTAL", desiredColumnAlias: "TOTAL" },
        { name: "ID_2", desiredColumnAlias: "PRODUCTS__ID" },
        { name: "ID_3", desiredColumnAlias: "PEOPLE__ID" },
      ];

      const newColumns: ColumnInfo[] = [
        { name: "ID", desiredColumnAlias: "ID" },
        { name: "TOTAL", desiredColumnAlias: "TOTAL" },
        { name: "ID_2", desiredColumnAlias: "PEOPLE__ID" },
      ];

      const oldSettings = createMockVisualizationSettings({
        "table.columns": [
          createMockTableColumnOrderSetting({
            name: "ID",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "TOTAL",
            enabled: false,
          }),
          createMockTableColumnOrderSetting({
            name: "ID_2",
            enabled: false,
          }),
          createMockTableColumnOrderSetting({
            name: "ID_3",
            enabled: true,
          }),
        ],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "TOTAL", enabled: false },
          { name: "ID_2", enabled: true },
        ],
      });
    });

    it("should handle adding new columns when previous columns are not available despite possible name conflicts", () => {
      const newColumns: ColumnInfo[] = [
        { name: "ID", desiredColumnAlias: "ID" },
        { name: "ID_2", desiredColumnAlias: "PRODUCTS__ID" },
        { name: "ID_3", desiredColumnAlias: "PEOPLE__ID" },
      ];

      const oldSettings = createMockVisualizationSettings({
        "table.columns": [
          createMockTableColumnOrderSetting({
            name: "ID",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "ID_2",
            enabled: false,
          }),
        ],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, undefined);
      expect(newSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
          { name: "ID_3", enabled: true },
        ],
      });
    });
  });
});
