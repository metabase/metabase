import type { DatasetColumn, RowValue } from "metabase-types/api";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
  findDrillThru,
} from "metabase-lib/test-helpers";
import { createAggregationColumn, createBreakoutColumn } from "./drills-common";

describe("drill-thru/underlying-records", () => {
  const drillType = "drill-thru/underlying-records";
  const defaultQuery = createQueryWithAggregation();
  const stageIndex = 0;
  const aggregationColumn = createAggregationColumn();
  const breakoutColumn = createBreakoutColumn();

  describe("availableDrillThrus", () => {
    const { value, row, dimensions } = getColumnData(
      aggregationColumn,
      breakoutColumn,
      10,
    );
    it("should allow to drill an aggregated query", () => {
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
  });

  describe("drillThru", () => {
    it("should drill an aggregated query", () => {
      const { value, row, dimensions } = getColumnData(
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
  });
});

function createQueryWithAggregation() {
  const stageIndex = 0;
  const defaultQuery = createQuery();
  const queryWithAggregation = Lib.aggregate(
    defaultQuery,
    stageIndex,
    Lib.aggregationClause(findAggregationOperator(defaultQuery, "count")),
  );
  return Lib.breakout(
    queryWithAggregation,
    stageIndex,
    columnFinder(
      queryWithAggregation,
      Lib.breakoutableColumns(queryWithAggregation, stageIndex),
    )("ORDERS", "CREATED_AT"),
  );
}

function getColumnData(
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
