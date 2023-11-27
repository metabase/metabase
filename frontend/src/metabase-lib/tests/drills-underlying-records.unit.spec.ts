import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createOrdersCreatedAtDatasetColumn } from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findAggregationOperator,
  findDrillThru,
} from "metabase-lib/test-helpers";
import { createCountColumn } from "./drills-common";

describe("drill-thru/underlying-records", () => {
  const drillType = "drill-thru/underlying-records";
  const defaultQuery = createQueryWithAggregation();
  const stageIndex = 0;
  const metricColumn = createCountColumn();
  const dimensionColumn = createOrdersCreatedAtDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill an aggregated query", () => {
      const { value, row, dimensions } = getColumnData(
        metricColumn,
        dimensionColumn,
        10,
      );

      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        metricColumn,
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
        metricColumn,
        dimensionColumn,
        10,
      );
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        metricColumn,
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
    )("ORDERS", "TOTAL"),
  );
}

function getColumnData(
  metricColumn: DatasetColumn,
  dimensionColumn: DatasetColumn,
  value: RowValue,
) {
  const row = [
    { key: "Created At", col: dimensionColumn, value: "2020-01-01" },
    { key: "Count", col: metricColumn, value },
  ];
  const dimensions = [{ column: metricColumn, value }];

  return { value, row, dimensions };
}
