import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { TYPE } from "metabase/lib/types";

const RAW_COLUMN = {
  source: "fields",
};
const METRIC_COLUMN = {
  source: "aggregation",
};
const DIMENSION_COLUMN = {
  source: "breakout",
};

describe("metabase/visualization/lib/table", () => {
  describe("getTableClickedObjectRowData", () => {
    it("should get row data from series", () => {
      const series = [
        {
          data: {
            rows: [[1, 2, 3]],
            cols: [DIMENSION_COLUMN, METRIC_COLUMN, RAW_COLUMN],
          },
        },
      ];
      const rowIndex = 0;

      expect(getTableClickedObjectRowData(series, rowIndex)).toEqual([
        { col: { source: "breakout" }, value: 1 },
        { col: { source: "aggregation" }, value: 2 },
        { col: { source: "fields" }, value: 3 },
      ]);
    });
  });

  describe("getTableCellClickedObject", () => {
    const rowData = ["row data"];

    describe("normal table", () => {
      it("should work with a raw data cell", () => {
        expect(
          getTableCellClickedObject(
            { rows: [[0]], cols: [RAW_COLUMN] },
            {},
            0,
            0,
            false,
            rowData,
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
          data: rowData,
        });
      });
      it("should work with a dimension cell", () => {
        expect(
          getTableCellClickedObject(
            { rows: [[1, 2]], cols: [DIMENSION_COLUMN, METRIC_COLUMN] },
            {},
            0,
            0,
            false,
            rowData,
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
          data: rowData,
        });
      });
      it("should work with a metric cell", () => {
        expect(
          getTableCellClickedObject(
            { rows: [[1, 2]], cols: [DIMENSION_COLUMN, METRIC_COLUMN] },
            {},
            0,
            1,
            false,
            rowData,
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
          data: rowData,
        });
      });
    });
    describe("pivoted table", () => {
      // TODO:
    });
  });

  describe("isColumnRightAligned", () => {
    it("should return true for numeric columns without a semantic type", () => {
      expect(isColumnRightAligned({ base_type: TYPE.Integer })).toBe(true);
    });
    it("should return true for numeric columns with semantic type Number", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          semantic_type: TYPE.Number,
        }),
      ).toBe(true);
    });
    it("should return true for numeric columns with semantic type latitude or longitude ", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          semantic_type: TYPE.Latitude,
        }),
      ).toBe(true);
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          semantic_type: TYPE.Longitude,
        }),
      ).toBe(true);
    });
    it("should return false for numeric columns with semantic type zip code", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          semantic_type: TYPE.ZipCode,
        }),
      ).toBe(false);
    });
    it("should return false for numeric columns with semantic type FK or PK", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          semantic_type: TYPE.FK,
        }),
      ).toBe(false);
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          semantic_type: TYPE.FK,
        }),
      ).toBe(false);
    });
  });
});
