import {
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";

describe("drill-thru/fk-details", () => {
  const drillType = "drill-thru/fk-details";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a FK column value", () => {
      const value = 10;
      const row = [{ col: defaultColumn, value }];
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
        value,
        row,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
      });
    });

    it("should not allow to drill with a PK column value", () => {
      const column = createOrdersIdDatasetColumn();
      const value = 10;
      const row = [{ col: column, value }];
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        column,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a FK column itself", () => {
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a null FK value", () => {
      const value = null;
      const row = [{ col: defaultColumn, value }];
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
        value,
        row,
      );

      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it("should drill with a FK column", () => {
      const value = 10;
      const row = [{ col: defaultColumn, value }];
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
        value,
        row,
      );

      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);

      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
