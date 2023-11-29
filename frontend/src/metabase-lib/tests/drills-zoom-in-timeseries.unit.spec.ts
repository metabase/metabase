import type { DatasetColumn, RowValue } from "metabase-types/api";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
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

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("drill-thru/zoom-in.timeseries (metabase#36173)", () => {
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
        const query = createQueryWithBreakout(bucketName);
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
      const query = createQueryWithBreakout("Month");
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
      const query = createQueryWithMultipleBreakouts("Month");
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
      const query = createQueryWithBreakout("Month");
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
      const query = createQueryWithBreakout(bucketName);
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

    it("should not allow to drill when clicked on a column", () => {
      const query = createQueryWithBreakout("Month");

      const drill = queryDrillThru(
        drillType,
        query,
        stageIndex,
        aggregationColumn,
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

    it("should not allow to drill with a non-editable query", () => {
      const query = createNotEditableQuery(createQueryWithBreakout("Month"));
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
    it.each<RowValue>([10, null])(
      'should drill when clicked on an aggregated cell with "%s" value',
      value => {
        const query = createQueryWithBreakout("Month");
        const { row, dimensions } = getCellData(
          aggregationColumn,
          breakoutColumn,
          value,
        );

        const { drill } = findDrillThru(
          drillType,
          query,
          stageIndex,
          aggregationColumn,
          value,
          row,
          dimensions,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill);

        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
        expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
      },
    );

    it.each<RowValue>([10, null])(
      'should drill when clicked on a pivot cell with "%s" value',
      value => {
        const query = createQueryWithMultipleBreakouts("Month");
        const { row, dimensions } = getPivotCellData(value);

        const { drill } = findDrillThru(
          drillType,
          query,
          stageIndex,
          undefined,
          undefined,
          row,
          dimensions,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill);

        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
        expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
      },
    );

    it.each<RowValue>([10, null])(
      'should drill when clicked on a legend item with "%s" value',
      value => {
        const query = createQueryWithBreakout("Month");
        const { dimensions } = getLegendItemData(value);

        const { drill } = findDrillThru(
          drillType,
          query,
          stageIndex,
          undefined,
          undefined,
          undefined,
          dimensions,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill);

        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
        expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
      },
    );
  });
});

function createQueryWithBreakout(bucketName: string) {
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

function createQueryWithMultipleBreakouts(bucketName: string) {
  const queryWithBreakout = createQueryWithBreakout(bucketName);
  const bucketColumn = columnFinder(
    queryWithBreakout,
    Lib.breakoutableColumns(queryWithBreakout, -1),
  )("ORDERS", "QUANTITY");

  return Lib.breakout(queryWithBreakout, -1, bucketColumn);
}

function createNotEditableQuery(query: Lib.Query) {
  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [],
      }),
    ],
  });

  return createQuery({
    metadata,
    query: Lib.toLegacyQuery(query),
  });
}
