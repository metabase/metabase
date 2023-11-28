import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createOrdersCreatedAtDatasetColumn } from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
  findBinningStrategy,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { createCountColumn } from "./drills-common";

describe("drill-thru/zoom-in.bins", () => {
  const drillType = "drill-thru/zoom-in.bins";
  const stageIndex = 0;
  const aggregationColumn = createCountColumn();
  const breakoutColumn = createOrdersCreatedAtDatasetColumn({
    source: "breakout",
  });

  describe("availableDrillThrus", () => {
    it.each(["Auto bin", "10 bins", "50 bins", "100 bins"])(
      'should allow to drill with "%s" binning strategy',
      bucketName => {
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
        });
      },
    );

    it("should not allow to drill without binning strategy", () => {
      const query = createQueryWithBreakout("Don't bin");
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
  )("ORDERS", "QUANTITY");

  return Lib.breakout(
    queryWithAggregation,
    -1,
    Lib.withBinning(
      breakoutColumn,
      findBinningStrategy(query, breakoutColumn, bucketName),
    ),
  );
}

function getCellData(
  aggregationColumn: DatasetColumn,
  breakoutColumn: DatasetColumn,
  value: RowValue,
) {
  const row = [
    { key: "Quantity", col: breakoutColumn, value: 10 },
    { key: "Count", col: aggregationColumn, value },
  ];
  const dimensions = [{ column: breakoutColumn, value }];

  return { value, row, dimensions };
}
