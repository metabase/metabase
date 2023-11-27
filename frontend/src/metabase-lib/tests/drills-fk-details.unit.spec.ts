import { createOrdersProductIdDatasetColumn } from "metabase-types/api/mocks/presets";
import { createQuery, findDrillThru } from "metabase-lib/test-helpers";

describe("drill-thru/fk-details", () => {
  const drillType = "drill-thru/fk-details";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill on a FK column value", () => {
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
  });
});
