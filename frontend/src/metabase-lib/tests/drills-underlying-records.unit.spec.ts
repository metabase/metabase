import type { DatasetColumn } from "metabase-types/api";
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
  value: number,
) {
  const row = [
    { key: "Created At", col: dimensionColumn, value: "2020-01-01" },
    { key: "Count", col: metricColumn, value },
  ];
  const dimensions = [{ column: metricColumn, value }];

  return { value, row, dimensions };
}
