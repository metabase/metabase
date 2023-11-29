import {
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createColumnClickObject,
  createQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { createNotEditableQuery } from "./drills-common";

describe("drill-thru/fk-details", () => {
  const drillType = "drill-thru/fk-details";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a FK column value", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
      });
    });
  });
});

describe("drill-thru/fk-filter", () => {
  const drillType = "drill-thru/fk-filter";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a FK column value (metabase#36000)", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        tableName: "Orders",
        columnName: "Product ID",
      });
    });
  });
});

describe.each<Lib.DrillThruType>([
  "drill-thru/fk-filter",
  "drill-thru/fk-details",
])("%s", drillType => {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a FK column value", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
      });
    });

    it("should not allow to drill with a PK column value", () => {
      const clickObject = createRawCellClickObject({
        column: createOrdersIdDatasetColumn(),
        value: 10,
      });

      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a non-key column value", () => {
      const clickObject = createRawCellClickObject({
        column: createOrdersTotalDatasetColumn(),
        value: 10,
      });

      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a FK column itself", () => {
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });

      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a null FK value (metabase#36133)", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: null,
      });

      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a non-editable query", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it("should drill with a FK column", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);

      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
