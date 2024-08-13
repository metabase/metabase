import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
  SAMPLE_METADATA,
} from "metabase-lib/test-helpers";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockTableColumnOrderSetting,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import {
  syncVizSettings,
  syncVizSettingsWithQuery,
  type ColumnInfo,
  syncVizSettingsWithSeries,
} from "./sync-viz-settings";

describe("syncVizSettings", () => {
  describe("table.columns", () => {
    it("should not update the setting if the order of columns has changed", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PEOPLE__ID" },
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
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PRODUCTS__ID" },
        { name: "ID_3", key: "PEOPLE__ID" },
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
        { name: "ID", key: "ID" },
        { name: "TOTAL", key: "TOTAL" },
        { name: "ID_2", key: "PRODUCTS__ID" },
        { name: "ID_3", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "TOTAL", key: "TOTAL" },
        { name: "ID_2", key: "PEOPLE__ID" },
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

    it("should preserve settings for columns that are not present both in old and new columns", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "TOTAL", key: "TOTAL" },
      ];
      const newColumns: ColumnInfo[] = [{ name: "ID", key: "ID" }];
      const oldSettings = createMockVisualizationSettings({
        "table.columns": [
          createMockTableColumnOrderSetting({
            name: "ID",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "TOTAL",
            enabled: true,
          }),
          createMockTableColumnOrderSetting({
            name: "TAX",
            enabled: false,
          }),
        ],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "TAX", enabled: false },
        ],
      });
    });
  });

  describe("column_settings", () => {
    it("should handle adding new columns with column.name changes", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PRODUCTS__ID" },
        { name: "ID_3", key: "PEOPLE__ID" },
      ];

      const oldSettings = createMockVisualizationSettings({
        column_settings: {
          '["name","ID"]': { column_title: "@ID" },
          '["name","ID_2"]': { column_title: "ID@" },
        },
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        column_settings: {
          '["name","ID"]': { column_title: "@ID" },
          '["name","ID_3"]': { column_title: "ID@" },
        },
      });
    });
  });

  describe("graph.metrics", () => {
    it("should not update the setting if the order of columns has changed", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [oldColumns[1], oldColumns[0]];
      const oldSettings = createMockVisualizationSettings({
        "graph.metrics": ["ID", "ID_2"],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual(oldSettings);
    });

    it("should handle adding new columns with column.name changes", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PRODUCTS__ID", isAggregation: true },
        { name: "ID_3", key: "PEOPLE__ID" },
      ];

      const oldSettings = createMockVisualizationSettings({
        "graph.metrics": ["ID", "ID_2"],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "graph.metrics": ["ID", "ID_3", "ID_2"],
      });
    });

    it("should not add new columns if they are not coming from aggregation", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "ID_2", key: "PRODUCTS__ID" },
        { name: "ID_3", key: "PEOPLE__ID" },
      ];

      const oldSettings = createMockVisualizationSettings({
        "graph.metrics": ["ID", "ID_2"],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "graph.metrics": ["ID", "ID_3"],
      });
    });

    it("should handle removing columns with column.name changes", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "TOTAL", key: "TOTAL" },
        { name: "ID_2", key: "PRODUCTS__ID" },
        { name: "ID_3", key: "PEOPLE__ID" },
      ];
      const newColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "TOTAL", key: "TOTAL" },
        { name: "ID_2", key: "PEOPLE__ID" },
      ];
      const oldSettings = createMockVisualizationSettings({
        "graph.metrics": ["ID", "TOTAL", "ID_2", "ID_3"],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "graph.metrics": ["ID", "TOTAL", "ID_2"],
      });
    });

    it("should preserve settings for columns that are not present both in old and new columns", () => {
      const oldColumns: ColumnInfo[] = [
        { name: "ID", key: "ID" },
        { name: "TOTAL", key: "TOTAL" },
      ];
      const newColumns: ColumnInfo[] = [{ name: "ID", key: "ID" }];
      const oldSettings = createMockVisualizationSettings({
        "graph.metrics": ["ID", "TOTAL", "TAX"],
      });

      const newSettings = syncVizSettings(oldSettings, newColumns, oldColumns);
      expect(newSettings).toEqual({
        "graph.metrics": ["ID", "TAX"],
      });
    });
  });
});

describe("syncVizSettingsWithQuery", () => {
  describe("table.columns", () => {
    it("should handle adding new columns with column.name changes", () => {
      const baseQuery = createQuery();
      const stageIndex = -1;
      const availableColumns = Lib.visibleColumns(baseQuery, stageIndex);
      const findColumn = columnFinder(baseQuery, availableColumns);
      const oldQuery = Lib.withFields(baseQuery, stageIndex, [
        findColumn("ORDERS", "ID"),
        findColumn("PEOPLE", "ID"),
      ]);
      const newQuery = Lib.withFields(baseQuery, stageIndex, [
        findColumn("ORDERS", "ID"),
        findColumn("PRODUCTS", "ID"),
        findColumn("PEOPLE", "ID"),
      ]);
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

      const newSettings = syncVizSettingsWithQuery(
        oldSettings,
        newQuery,
        oldQuery,
      );
      expect(newSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_3", enabled: false },
          { name: "ID_2", enabled: true },
        ],
      });
    });
  });

  describe("graph.metrics", () => {
    it("should handle adding new columns", () => {
      const oldQuery = createQueryWithClauses({
        aggregations: [
          { operatorName: "sum", tableName: "ORDERS", columnName: "TOTAL" },
        ],
        breakouts: [{ tableName: "ORDERS", columnName: "CREATED_AT" }],
      });
      const newQuery = createQueryWithClauses({
        aggregations: [
          { operatorName: "sum", tableName: "ORDERS", columnName: "TOTAL" },
          { operatorName: "sum", tableName: "ORDERS", columnName: "SUBTOTAL" },
        ],
        breakouts: [{ tableName: "ORDERS", columnName: "CREATED_AT" }],
      });
      const oldSettings = createMockVisualizationSettings({
        "graph.metrics": ["sum"],
      });

      const newSettings = syncVizSettingsWithQuery(
        oldSettings,
        newQuery,
        oldQuery,
      );
      expect(newSettings).toEqual({
        "graph.metrics": ["sum", "sum_2"],
      });
    });
  });
});

describe("syncVizSettingsWithSeries", () => {
  const query = Lib.nativeQuery(
    SAMPLE_DB_ID,
    Lib.metadataProvider(SAMPLE_DB_ID, SAMPLE_METADATA),
    "SELECT * FROM ORDERS",
  );

  describe("table.columns", () => {
    const newSeries: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "ID", source: "native" }),
            createMockColumn({ name: "ID_2", source: "native" }),
            createMockColumn({ name: "ID_3", source: "native" }),
          ],
        }),
      },
    ];
    const oldSeries: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "ID", source: "native" }),
            createMockColumn({ name: "ID_2", source: "native" }),
          ],
        }),
      },
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

    it("should handle adding new columns without column.name changes", () => {
      const newSettings = syncVizSettingsWithSeries(
        oldSettings,
        query,
        newSeries,
        oldSeries,
      );
      expect(newSettings).toEqual({
        "table.columns": [
          { name: "ID", enabled: true },
          { name: "ID_2", enabled: false },
          { name: "ID_3", enabled: true },
        ],
      });
    });

    it("should ignore updates if there are errors in new query results", () => {
      const newSettings = syncVizSettingsWithSeries(
        oldSettings,
        query,
        newSeries.map(singleSeries => ({
          ...singleSeries,
          error: { status: 500 },
        })),
        oldSeries,
      );
      expect(newSettings).toEqual(oldSettings);
    });

    it("should ignore updates if there are errors in old query results", () => {
      const newSettings = syncVizSettingsWithSeries(
        oldSettings,
        query,
        newSeries,
        oldSeries.map(singleSeries => ({
          ...singleSeries,
          error: { status: 500 },
        })),
      );
      expect(newSettings).toEqual(oldSettings);
    });
  });

  describe("graph.metrics", () => {
    const newSeries: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "COUNT", source: "native" }),
            createMockColumn({ name: "AVG", source: "native" }),
            createMockColumn({ name: "CREATED_AT", source: "native" }),
          ],
        }),
      },
    ];
    const oldSeries: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "COUNT", source: "native" }),
            createMockColumn({ name: "CREATED_AT", source: "native" }),
          ],
        }),
      },
    ];
    const oldSettings = createMockVisualizationSettings({
      "graph.metrics": ["COUNT"],
    });

    it("should ignore metric column updates for native queries", () => {
      const newSettings = syncVizSettingsWithSeries(
        oldSettings,
        query,
        newSeries,
        oldSeries,
      );
      expect(newSettings).toEqual(oldSettings);
    });
  });
});
