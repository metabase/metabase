import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
  createProductsCategoryDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createQuery,
  createSingleStageQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { createCountDatasetColumn } from "./drills-common";

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
    const query = createSingleStageQuery({
      aggregations: [{ operatorName: "count" }],
    });
    const clickObject = createRawCellClickObject({
      column: createCountDatasetColumn(),
      value: 10,
    });

    it("should drill thru an aggregated cell", () => {
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
    const query = createSingleStageQuery({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
    });
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: createCountDatasetColumn(),
        value: 10,
      },
      breakouts: [
        {
          column: createOrdersCreatedAtDatasetColumn({
            source: "breakout",
          }),
          value: "2020-01-01",
        },
      ],
    });

    it("should drill thru an aggregated cell without time columns", () => {
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

  describe("1 aggregation and 1 category breakout", () => {
    const query = createSingleStageQuery({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CATEGORY", tableName: "PEOPLE" }],
    });
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: createCountDatasetColumn(),
        value: 10,
      },
      breakouts: [
        {
          column: createProductsCategoryDatasetColumn({
            source: "breakout",
          }),
          value: "2020-01-01",
        },
      ],
    });

    it("should drill thru an aggregated cell without location columns", () => {
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const pivotTypes = Lib.pivotTypes(drill);
      expect(pivotTypes).toEqual(["category", "time"]);
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
