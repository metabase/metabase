import {
  getTableCellClickedObject,
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
  describe("getTableCellClickedObject", () => {
    describe("normal table", () => {
      it("should work with a raw data cell", () => {
        expect(
          getTableCellClickedObject(
            { rows: [[0]], cols: [RAW_COLUMN] },
            0,
            0,
            false,
          ),
        ).toEqual({
          value: 0,
          column: RAW_COLUMN,
        });
      });
      it("should work with a dimension cell", () => {
        expect(
          getTableCellClickedObject(
            { rows: [[1, 2]], cols: [DIMENSION_COLUMN, METRIC_COLUMN] },
            0,
            0,
            false,
          ),
        ).toEqual({
          value: 1,
          column: DIMENSION_COLUMN,
        });
      });
      it("should work with a metric cell", () => {
        expect(
          getTableCellClickedObject(
            { rows: [[1, 2]], cols: [DIMENSION_COLUMN, METRIC_COLUMN] },
            0,
            1,
            false,
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
        });
      });
    });
    describe("pivoted table", () => {
      // TODO:
    });
  });

  describe("isColumnRightAligned", () => {
    it("should return true for numeric columns without a special type", () => {
      expect(isColumnRightAligned({ base_type: TYPE.Integer })).toBe(true);
    });
    it("should return true for numeric columns with special type Number", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          special_type: TYPE.Number,
        }),
      ).toBe(true);
    });
    it("should return true for numeric columns with special type latitude or longitude ", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          special_type: TYPE.Latitude,
        }),
      ).toBe(true);
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          special_type: TYPE.Longitude,
        }),
      ).toBe(true);
    });
    it("should return false for numeric columns with special type zip code", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          special_type: TYPE.ZipCode,
        }),
      ).toBe(false);
    });
    it("should return false for numeric columns with special type FK or PK", () => {
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          special_type: TYPE.FK,
        }),
      ).toBe(false);
      expect(
        isColumnRightAligned({
          base_type: TYPE.Integer,
          special_type: TYPE.FK,
        }),
      ).toBe(false);
    });
  });
});
