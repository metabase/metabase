import {
  createOrdersIdDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";
import {
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";

describe("drill-thru/distribution", () => {
  const drillType = "drill-thru/distribution";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill when clicked on a column header", () => {
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
      });
    });
  });

  it("should not allow to drill when clicked on a value", () => {
    const value = 10;
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

  it("should not allow to drill when clicked on a null value", () => {
    const value = null;
    const row = [{ col: defaultColumn, value }];
    const drill = queryDrillThru(
      drillType,
      defaultQuery,
      0,
      defaultColumn,
      value,
      row,
    );

    expect(drill).toBeNull();
  });

  it('should not allow to drill with "type/PK" type', () => {
    const column = createOrdersIdDatasetColumn();
    const drill = queryDrillThru(drillType, defaultQuery, stageIndex, column);
    expect(drill).toBeNull();
  });
});
