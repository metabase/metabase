import type { DatasetColumn, RowValue } from "metabase-types/api";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
  findDrillThru,
  findTemporalBucket,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { createCountColumn } from "./drills-common";

describe("drill-thru/zoom-in.timeseries", () => {
  const drillType = "drill-thru/zoom-in.timeseries";
  const stageIndex = 0;
  const aggregationColumn = createCountColumn();
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
        const query = createQueryWithTemporalBucket(bucketName);
        const { value, row, dimensions } = getCellData(
          aggregationColumn,
          breakoutColumn,
          10,
        );

        const { drillInfo } = findDrillThru(
          drillType,
          query,
          stageIndex,
          aggregationColumn,
          value,
          row,
          dimensions,
        );

        expect(drillInfo).toMatchObject({
          type: drillType,
          displayName,
        });
      },
    );

    it("should allow to drill when clicked on a null value", () => {
      const query = createQueryWithTemporalBucket("Month");
      const { value, row, dimensions } = getCellData(
        aggregationColumn,
        breakoutColumn,
        null,
      );

      const { drillInfo } = findDrillThru(
        drillType,
        query,
        stageIndex,
        aggregationColumn,
        value,
        row,
        dimensions,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        tableName: "See this month by weeks",
      });
    });

    it("should allow to drill when clicked on a pivot cell", () => {
      const query = createQueryWithTemporalBucket("Month");
      const { row, dimensions } = getPivotCellData(10);

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
        displayName: "See this month by weeks",
      });
    });

    it("should allow to drill when clicked on a legend item", () => {
      const query = createQueryWithTemporalBucket("Month");
      const { dimensions } = getLegendItemData(10);

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
      const query = createQueryWithTemporalBucket(bucketName);
      const { value, row, dimensions } = getCellData(
        aggregationColumn,
        breakoutColumn,
        10,
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
});

function createQueryWithTemporalBucket(bucketName: string) {
  const query = createQuery();

  const queryWithAggregation = Lib.aggregate(
    query,
    -1,
    Lib.aggregationClause(findAggregationOperator(query, "count")),
  );

  const breakoutColumn = columnFinder(
    queryWithAggregation,
    Lib.breakoutableColumns(queryWithAggregation, -1),
  )("ORDERS", "CREATED_AT");

  return Lib.breakout(
    queryWithAggregation,
    -1,
    Lib.withTemporalBucket(
      breakoutColumn,
      findTemporalBucket(query, breakoutColumn, bucketName),
    ),
  );
}

function getCellData(
  aggregationColumn: DatasetColumn,
  breakoutColumn: DatasetColumn,
  value: RowValue,
) {
  const row = [
    { key: "Created At", col: breakoutColumn, value: "2020-01-01" },
    { key: "Count", col: aggregationColumn, value },
  ];
  const dimensions = [{ column: breakoutColumn, value }];

  return { value, row, dimensions };
}

function getPivotCellData(value: RowValue) {
  const aggregationColumn = createCountColumn();
  const breakoutColumn1 = createOrdersCreatedAtDatasetColumn({
    source: "breakout",
  });
  const breakoutColumn2 = createOrdersQuantityDatasetColumn({
    source: "breakout",
  });

  const row = [
    { col: breakoutColumn1, value: "2020-01-01" },
    { col: breakoutColumn2, value: 0 },
    { col: aggregationColumn, value },
  ];
  const dimensions = [
    { column: breakoutColumn1, value: "2020-01-01" },
    { column: breakoutColumn2, value: 0 },
  ];

  return { value, row, dimensions };
}

function getLegendItemData(value: RowValue) {
  const column = createOrdersQuantityDatasetColumn({ source: "breakout" });
  const dimensions = [{ column, value }];
  return { value, dimensions };
}
