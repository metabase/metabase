import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const RAW_COLUMN = createMockColumn({
  source: "fields",
});
const METRIC_COLUMN = createMockColumn({
  source: "aggregation",
});
const DIMENSION_COLUMN = createMockColumn({
  source: "breakout",
});

describe("metabase/visualization/lib/table", () => {
  describe("getTableClickedObjectRowData", () => {
    const series: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          rows: [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ],
          cols: [DIMENSION_COLUMN, METRIC_COLUMN, RAW_COLUMN],
        }),
      },
    ];

    it("should get row data from series", () => {
      const rowIndex = 0;
      const colIndex = 0;
      const isPivoted = false;
      const data = createMockDatasetData({ sourceRows: [] });

      expect(
        getTableClickedObjectRowData(
          series,
          rowIndex,
          colIndex,
          isPivoted,
          data,
        ),
      ).toMatchObject([
        { col: { source: "breakout" }, value: 1 },
        { col: { source: "aggregation" }, value: 2 },
        { col: { source: "fields" }, value: 3 },
      ]);
    });

    it("should get correct row data when pivoted", () => {
      const rowIndex = 1;
      const colIndex = 2;
      const isPivoted = true;
      const pivotedData = createMockDatasetData({
        sourceRows: [
          [null, 0, 1],
          [null, null, 2],
        ],
      });

      expect(
        getTableClickedObjectRowData(
          series,
          rowIndex,
          colIndex,
          isPivoted,
          pivotedData,
        ),
      ).toMatchObject([
        { col: { source: "breakout" }, value: 7 },
        { col: { source: "aggregation" }, value: 8 },
        { col: { source: "fields" }, value: 9 },
      ]);
    });

    it("should return null when asked for an empty cell in a pivot table", () => {
      const rowIndex = 1;
      const colIndex = 1;
      const isPivoted = true;
      const pivotedData = createMockDatasetData({
        sourceRows: [
          [null, 0, 1],
          [null, null, 2],
        ],
      });

      expect(
        getTableClickedObjectRowData(
          series,
          rowIndex,
          colIndex,
          isPivoted,
          pivotedData,
        ),
      ).toBeNull();
    });
  });

  describe("getTableCellClickedObject", () => {
    describe("normal table", () => {
      it("should work with a raw data cell", () => {
        expect(
          getTableCellClickedObject(
            createMockDatasetData({
              rows: [[0]],
              cols: [RAW_COLUMN],
            }),
            {},
            0,
            0,
            false,
            null,
          ),
        ).toEqual({
          value: 0,
          column: RAW_COLUMN,
          settings: {},
          origin: {
            cols: [RAW_COLUMN],
            row: [0],
            rowIndex: 0,
          },
          data: undefined,
        });
      });

      it("should work with a dimension cell", () => {
        expect(
          getTableCellClickedObject(
            createMockDatasetData({
              rows: [[1, 2]],
              cols: [DIMENSION_COLUMN, METRIC_COLUMN],
            }),
            {},
            0,
            0,
            false,
            null,
          ),
        ).toEqual({
          value: 1,
          column: DIMENSION_COLUMN,
          origin: {
            cols: [DIMENSION_COLUMN, METRIC_COLUMN],
            row: [1, 2],
            rowIndex: 0,
          },
          settings: {},
          data: undefined,
        });
      });

      it("should work with a metric cell", () => {
        expect(
          getTableCellClickedObject(
            createMockDatasetData({
              rows: [[1, 2]],
              cols: [DIMENSION_COLUMN, METRIC_COLUMN],
            }),
            {},
            0,
            1,
            false,
            null,
          ),
        ).toEqual({
          value: 2,
          column: METRIC_COLUMN,
          dimensions: [
            {
              value: 1,
              column: DIMENSION_COLUMN,
            },
          ],
          origin: {
            cols: [DIMENSION_COLUMN, METRIC_COLUMN],
            row: [1, 2],
            rowIndex: 0,
          },
          settings: {},
          data: undefined,
        });
      });
    });

    describe("pivoted table", () => {
      const ROW_COLUMN = createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At",
        source: "breakout",
      });
      const PIVOT_COLUMN = createMockColumn({
        name: "SOURCE",
        display_name: "Source",
        source: "breakout",
      });
      const METRIC = createMockColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
      });
      const ORGANIC_METRIC_COLUMN = {
        ...METRIC,
        _dimension: { value: "Organic", column: PIVOT_COLUMN },
      };
      const PAID_METRIC_COLUMN = {
        ...METRIC,
        _dimension: { value: "Paid", column: PIVOT_COLUMN },
      };

      it("preserves source breakout dimensions on metric-cell clicks", () => {
        const sourceData = createMockDatasetData({
          cols: [ROW_COLUMN, PIVOT_COLUMN, METRIC],
          rows: [
            ["2024-01-01", "Organic", 10],
            ["2024-01-01", "Paid", 20],
          ],
        });
        const pivotedData = createMockDatasetData({
          cols: [ROW_COLUMN, ORGANIC_METRIC_COLUMN, PAID_METRIC_COLUMN],
          rows: [
            Object.assign(["2024-01-01", 10, 20], {
              _dimension: { value: "2024-01-01", column: ROW_COLUMN },
            }),
          ],
          sourceRows: [[0, 0, 1]],
        });
        const series: Series = [
          {
            card: createMockCard(),
            data: sourceData,
          },
        ];

        expect(
          getTableCellClickedObject(
            pivotedData,
            {},
            0,
            2,
            true,
            getTableClickedObjectRowData(series, 0, 2, true, pivotedData),
          ),
        ).toEqual({
          value: 20,
          column: PAID_METRIC_COLUMN,
          settings: {},
          dimensions: [
            { value: "2024-01-01", column: ROW_COLUMN },
            { value: "Paid", column: PIVOT_COLUMN },
          ],
          data: [
            { col: ROW_COLUMN, value: "2024-01-01" },
            { col: PIVOT_COLUMN, value: "Paid" },
            { col: METRIC, value: 20 },
          ],
        });
      });
    });
  });

  describe("isColumnRightAligned", () => {
    it("should return true for numeric columns without a semantic type", () => {
      const column = createMockColumn({ base_type: TYPE.Integer });
      expect(isColumnRightAligned(column)).toBe(true);
    });

    it("should return true for numeric columns with semantic type Number", () => {
      const column = createMockColumn({
        base_type: TYPE.Integer,
        semantic_type: TYPE.Number,
      });
      expect(isColumnRightAligned(column)).toBe(true);
    });

    it("should return true for numeric columns with semantic type latitude or longitude", () => {
      const latitudeColumn = createMockColumn({
        base_type: TYPE.Integer,
        semantic_type: TYPE.Latitude,
      });
      const longitudeColumn = createMockColumn({
        base_type: TYPE.Integer,
        semantic_type: TYPE.Longitude,
      });
      expect(isColumnRightAligned(latitudeColumn)).toBe(true);
      expect(isColumnRightAligned(longitudeColumn)).toBe(true);
    });

    it("should return false for numeric columns with semantic type zip code", () => {
      const column = createMockColumn({
        base_type: TYPE.Integer,
        semantic_type: TYPE.ZipCode,
      });
      expect(isColumnRightAligned(column)).toBe(false);
    });

    it("should return false for numeric columns with semantic type FK or PK", () => {
      const fkColumn = createMockColumn({
        base_type: TYPE.Integer,
        semantic_type: TYPE.FK,
      });
      const pkColumn = createMockColumn({
        base_type: TYPE.Integer,
        semantic_type: TYPE.PK,
      });

      expect(isColumnRightAligned(fkColumn)).toBe(false);
      expect(isColumnRightAligned(pkColumn)).toBe(false);
    });
  });
});
