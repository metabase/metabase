import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createAggregatedQuery,
  createAggregatedQueryWithBreakout,
  createCountDatasetColumn,
} from "./drills-common";

describe("drill-thru/pivot", () => {
  const drillType = "drill-thru/pivot";
  const stageIndex = 0;

  describe("raw query", () => {
    const query = createQuery();
    const clickObject = createRawCellClickObject({
      column: createOrdersTotalDatasetColumn(),
      value: 10,
    });

    it("should not drill thru a raw query", () => {
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("1 aggregation", () => {
    const query = createAggregatedQuery({ aggregationOperatorName: "count" });
    const clickObject = createRawCellClickObject({
      column: createCountDatasetColumn(),
      value: 10,
    });

    it("should drill thru with all supported pivot columns", () => {
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const pivotTypes = Lib.pivotTypes(drill);
      expect(pivotTypes).toEqual(["category", "location", "time"]);
      verifyDrillThru(query, stageIndex, drill, pivotTypes);
    });
  });

  describe("1 aggregation and 1 date breakout", () => {
    const query = createAggregatedQueryWithBreakout({
      aggregationOperatorName: "count",
      breakoutColumnName: "CREATED_AT",
      breakoutColumnTableName: "ORDERS",
    });
    const clickObject = createAggregatedCellClickObject({
      aggregationColumn: createCountDatasetColumn(),
      aggregationColumnValue: 10,
      breakoutColumn: createOrdersCreatedAtDatasetColumn({
        source: "breakout",
      }),
      breakoutColumnValue: "2020-01-01",
    });

    it("should drill thru with category and location columns", () => {
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const pivotTypes = Lib.pivotTypes(drill);
      expect(pivotTypes).toEqual(["category", "location"]);
      verifyDrillThru(query, stageIndex, drill, pivotTypes);
    });
  });
});

function verifyDrillThru(
  query: Lib.Query,
  stageIndex: number,
  drill: Lib.DrillThru,
  pivotTypes: Lib.PivotType[],
) {
  pivotTypes.forEach(pivotType => {
    const columns = Lib.pivotColumnsForType(drill, pivotType);
    expect(columns.length).toBeGreaterThanOrEqual(1);

    columns.forEach(column => {
      const newQuery = Lib.drillThru(query, stageIndex, drill, column);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });
  });
}
