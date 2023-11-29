import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersTotalDatasetColumn,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createAggregatedQuery,
  createAggregatedQueryWithBreakouts,
  createCountColumn,
  getAggregatedCellClickData,
  getPivotCellClickData,
} from "./drills-common";

describe("drill-thru/underlying-records", () => {
  const drillType = "drill-thru/underlying-records";
  const defaultQuery = createAggregatedQuery({
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
      const { value, row, dimensions } = getAggregatedCellClickData({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        aggregationColumn,
        value,
        row,
        dimensions,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: value,
        tableName: "Orders",
      });
    });

    it("should allow to drill when clicked on a pivot cell (metabase#35394)", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const { value, row, dimensions } = getPivotCellClickData({
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
        drillType,
        query,
        stageIndex,
        undefined,
        undefined,
        row,
        dimensions,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: value,
        tableName: "Orders",
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should allow to drill when clicked on a legend item (metabase#35343)", () => {
      const query = createQueryWithMultipleBreakouts();
      const { value, dimensions } = getLegendItemData(10);

      const { drillInfo } = findDrillThru(
        drillType,
        query,
        stageIndex,
        undefined,
        undefined,
        undefined,
        dimensions,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: value,
        tableName: "Orders",
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should use the default row count for aggregations with negative values (metabase#36143)", () => {
      const { value, row, dimensions } = getCellData(
        aggregationColumn,
        breakoutColumn,
        -10,
      );

      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        aggregationColumn,
        value,
        row,
        dimensions,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 2,
        tableName: "Orders",
      });
    });

    it("should allow to drill when clicked on a null value", () => {
      const { value, row, dimensions } = getCellData(
        aggregationColumn,
        breakoutColumn,
        null,
      );

      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        aggregationColumn,
        value,
        row,
        dimensions,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        rowCount: 2,
        tableName: "Orders",
      });
    });

    it("should not allow to drill when there is no aggregation", () => {
      const column = createOrdersTotalDatasetColumn();
      const value = 10;
      const row = [{ col: column, value }];

      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        aggregationColumn,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a native query", () => {
      const query = createQuery({
        query: {
          type: "native",
          database: SAMPLE_DB_ID,
          native: { query: "SELECT * FROM ORDERS" },
        },
      });
      const column = createOrdersTotalDatasetColumn({
        id: undefined,
        field_ref: ["field", "TOTAL", { "base-type": "type/Float" }],
      });

      const drill = queryDrillThru(drillType, query, stageIndex, column);

      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to drill with a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const { value, row, dimensions } = getCellData(
        aggregationColumn,
        breakoutColumn,
        -10,
      );

      const drill = queryDrillThru(
        drillType,
        query,
        stageIndex,
        aggregationColumn,
        value,
        row,
        dimensions,
      );

      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it("should drill when clicked on an aggregated cell", () => {
      const { value, row, dimensions } = getCellData(
        aggregationColumn,
        breakoutColumn,
        10,
      );

      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        aggregationColumn,
        value,
        row,
        dimensions,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);

      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill when clicked on a pivot cell (metabase#35394)", () => {
      const query = createQueryWithMultipleBreakouts();
      const { row, dimensions } = getPivotCellData(10);

      const { drill } = findDrillThru(
        drillType,
        query,
        stageIndex,
        undefined,
        undefined,
        row,
        dimensions,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);

      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill when clicked on a legend item (metabase#35343)", () => {
      const query = createQueryWithMultipleBreakouts();
      const { dimensions } = getLegendItemData(10);

      const { drill } = findDrillThru(
        drillType,
        query,
        stageIndex,
        undefined,
        undefined,
        undefined,
        dimensions,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);

      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
