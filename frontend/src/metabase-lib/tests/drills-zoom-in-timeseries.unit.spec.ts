import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createColumnClickObject,
  createLegendItemClickObject,
  createPivotCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createAggregatedQueryWithBreakout,
  createAggregatedQueryWithBreakouts,
  createCountDatasetColumn,
  createNotEditableQuery,
} from "./drills-common";

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("drill-thru/zoom-in.timeseries (metabase#36173)", () => {
  const drillType = "drill-thru/zoom-in.timeseries";
  const stageIndex = 0;
  const aggregationColumn = createCountDatasetColumn();
  const breakoutColumn = createOrdersCreatedAtDatasetColumn({
    source: "breakout",
  });

  describe("availableDrillThrus", () => {
    it.each([
      { bucketName: "Year", displayName: "See this year by quarters" },
      { bucketName: "Quarter", displayName: "See this quarter by months" },
      { bucketName: "Month", displayName: "See this month by weeks" },
      { bucketName: "Day", displayName: "See this day by hour" },
      { bucketName: "Hour", displayName: "See this hour by minute" },
    ])(
      'should allow to drill with "$bucketName" temporal bucket',
      ({ bucketName, displayName }) => {
        const query = createAggregatedQueryWithBreakout({
          aggregationOperatorName: "count",
          breakoutColumnName: breakoutColumn.name,
          breakoutColumnTableName: "ORDERS",
          breakoutColumnTemporalBucketName: bucketName,
        });
        const clickObject = createAggregatedCellClickObject({
          aggregationColumn,
          aggregationColumnValue: 10,
          breakoutColumn,
          breakoutColumnValue: "2020-01-01",
        });

        const { drillInfo } = findDrillThru(
          query,
          stageIndex,
          clickObject,
          drillType,
        );

        expect(drillInfo).toMatchObject({
          type: drillType,
          displayName,
        });
      },
    );

    it("should allow to drill when clicked on a null value", () => {
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: breakoutColumn.name,
        breakoutColumnTableName: "ORDERS",
        breakoutColumnTemporalBucketName: "Month",
      });
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: null,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const { drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        tableName: "See this month by weeks",
      });
    });

    it("should allow to drill when clicked on a pivot cell", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn1TemporalBucketName: "Month",
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
        displayName: "See this month by weeks",
      });
    });

    it("should allow to drill when clicked on a legend item", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createLegendItemClickObject({
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const { drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        displayName: "See this month by weeks",
      });
    });

    it.each([
      "Minute",
      "Minute of hour",
      "Hour of day",
      "Day of week",
      "Day of month",
      "Day of year",
      "Week of year",
      "Month of year",
      "Quarter of year",
      "Don't bin",
    ])('should not allow to drill with "%s" temporal bucket', bucketName => {
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: breakoutColumn.name,
        breakoutColumnTableName: "ORDERS",
        breakoutColumnTemporalBucketName: bucketName,
      });
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: null,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not allow to drill when clicked on a column", () => {
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: breakoutColumn.name,
        breakoutColumnTableName: "ORDERS",
        breakoutColumnTemporalBucketName: "Month",
      });
      const clickObject = createColumnClickObject({
        column: aggregationColumn,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not allow to drill with a non-editable query", () => {
      const query = createNotEditableQuery(
        createAggregatedQueryWithBreakout({
          aggregationOperatorName: "count",
          breakoutColumnName: breakoutColumn.name,
          breakoutColumnTableName: "ORDERS",
          breakoutColumnTemporalBucketName: "Month",
        }),
      );
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
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: breakoutColumn.name,
        breakoutColumnTableName: "ORDERS",
        breakoutColumnTemporalBucketName: "Month",
      });
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn,
        aggregationColumnValue: 10,
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it('should drill when clicked on a pivot cell with "%s" value', () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn1TemporalBucketName: "Month",
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
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it('should drill when clicked on a legend item with "%s" value', () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createLegendItemClickObject({
        breakoutColumn,
        breakoutColumnValue: "2020-01-01",
      });
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
