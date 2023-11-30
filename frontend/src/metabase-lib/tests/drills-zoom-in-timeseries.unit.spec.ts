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

  describe.each([
    { bucketName: "Year", displayName: "See this year by quarters" },
    { bucketName: "Quarter", displayName: "See this quarter by months" },
    { bucketName: "Month", displayName: "See this month by weeks" },
    { bucketName: "Day", displayName: "See this day by hour" },
    { bucketName: "Hour", displayName: "See this hour by minute" },
  ])("$bucketName", ({ bucketName, displayName }) => {
    it("should drill thru an aggregated cell", () => {
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: breakoutColumn.name,
        breakoutColumnTableName: "ORDERS",
        breakoutColumnTemporalBucketName: bucketName,
      });
      const clickObject = createAggregatedCellClickObject({
        aggregation: {
          column: aggregationColumn,
          value: 10,
        },
        breakouts: [
          {
            column: breakoutColumn,
            value: "2020-01-01",
          },
        ],
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        displayName,
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill thru a pivot cell", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn1TemporalBucketName: bucketName,
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createPivotCellClickObject({
        aggregation: {
          column: aggregationColumn,
          value: 10,
        },
        breakouts: [
          {
            column: breakoutColumn,
            value: "2020-01-01",
          },
          {
            column: createOrdersQuantityDatasetColumn({
              source: "breakout",
            }),
            value: 0,
          },
        ],
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        displayName,
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill thru a legend item", () => {
      const query = createAggregatedQueryWithBreakouts({
        aggregationOperatorName: "count",
        breakoutColumn1Name: "CREATED_AT",
        breakoutColumn1TableName: "ORDERS",
        breakoutColumn1TemporalBucketName: bucketName,
        breakoutColumn2Name: "QUANTITY",
        breakoutColumn2TableName: "ORDERS",
      });
      const clickObject = createLegendItemClickObject({
        column: breakoutColumn,
        value: "2020-01-01",
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        displayName,
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should not drill thru a column", () => {
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: breakoutColumn.name,
        breakoutColumnTableName: "ORDERS",
        breakoutColumnTemporalBucketName: bucketName,
      });
      const clickObject = createColumnClickObject({
        column: aggregationColumn,
      });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not drill thru a non-editable query", () => {
      const query = createNotEditableQuery(
        createAggregatedQueryWithBreakout({
          aggregationOperatorName: "count",
          breakoutColumnName: breakoutColumn.name,
          breakoutColumnTableName: "ORDERS",
          breakoutColumnTemporalBucketName: bucketName,
        }),
      );
      const clickObject = createAggregatedCellClickObject({
        aggregation: {
          column: aggregationColumn,
          value: 10,
        },
        breakouts: [
          {
            column: breakoutColumn,
            value: "2020-01-01",
          },
        ],
      });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
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
  ])('should not drill thru with "%s" temporal bucket', bucketName => {
    const query = createAggregatedQueryWithBreakout({
      aggregationOperatorName: "count",
      breakoutColumnName: breakoutColumn.name,
      breakoutColumnTableName: "ORDERS",
      breakoutColumnTemporalBucketName: bucketName,
    });
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: aggregationColumn,
        value: 10,
      },
      breakouts: [
        {
          column: breakoutColumn,
          value: "2020-01-01",
        },
      ],
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });
});
