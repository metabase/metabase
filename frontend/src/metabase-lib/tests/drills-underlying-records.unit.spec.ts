import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createLegendItemClickObject,
  createPivotCellClickObject,
  createQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createAggregatedQueryWithBreakout,
  createAggregatedQueryWithBreakouts,
  createCountColumn,
  createNotEditableQuery,
} from "./drills-common";

describe("drill-thru/underlying-records", () => {
  const drillType = "drill-thru/underlying-records";
  const defaultQuery = createAggregatedQueryWithBreakout({
    aggregationOperatorName: "count",
    breakoutColumnName: "CREATED_AT",
    breakoutColumnTableName: "ORDERS",
  });
  const stageIndex = 0;
  const aggregationColumn = createCountColumn();
  const breakoutColumn = createOrdersCreatedAtDatasetColumn({
    source: "breakout",
  });

  describe("availableDrillThrus", () => {
    it("should allow to drill an aggregated query", () => {
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 10,
        tableName: "Orders",
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should allow to drill when clicked on a pivot cell (metabase#35394)", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createPivotCellClickObject({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn1: breakoutColumn,
        breakoutColumn1Value: "2020-01-01",
        breakoutColumn2: createOrdersQuantityDatasetColumn({
          source: "breakout",
        }),
        breakoutColumn2Value: 0,
      });

      const { drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 10,
        tableName: "Orders",
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should allow to drill when clicked on a legend item (metabase#35343)", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createLegendItemClickObject({
        breakoutColumn,
        breakoutColumnValue: 10,
      });

      const { drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 2,
        tableName: "Orders",
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should use the default row count for aggregations with negative values (metabase#36143)", () => {
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: -10,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 2,
        tableName: "Orders",
      });
    });

    it("should allow to drill when clicked on a null value", () => {
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: null,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 2,
        tableName: "Orders",
      });
    });

    it("should not allow to drill when there is no aggregation", () => {
      const query = createQuery();
      const column = createOrdersTotalDatasetColumn();
      const clickObject = createRawCellClickObject({ column, value: 10 });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to drill with a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it("should drill when clicked on an aggregated cell", () => {
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill when clicked on a pivot cell (metabase#35394)", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createPivotCellClickObject({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn1: breakoutColumn,
        breakoutColumn1Value: "2020-01-01",
        breakoutColumn2: createOrdersQuantityDatasetColumn({
          source: "breakout",
        }),
        breakoutColumn2Value: 0,
      });
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill when clicked on a legend item (metabase#35343)", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createLegendItemClickObject({
        breakoutColumn,
        breakoutColumnValue: 10,
      });
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
