import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
  createReviewsBodyDatasetColumn,
  createReviewsReviewerDatasetColumn,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createColumnClickObject,
  createQuery,
  createRawCellClickObject,
  createQueryWithClauses,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
} from "./drills-common";

describe("drill-thru/quick-filter", () => {
  const drillType = "drill-thru/quick-filter";
  const stageIndex = 0;

  describe("raw query", () => {
    const defaultQuery = createQuery();
    const expectedStageCount = 1;

    it("should drill a cell with null value", () => {
      const column = createOrdersTotalDatasetColumn();
      const clickObject = createRawCellClickObject({ column, value: null });
      const { drill, drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({ operators: ["=", "≠"] });
      verifyDrillThru(defaultQuery, drill, drillInfo, expectedStageCount);
    });

    it("should drill a cell for a numeric column", () => {
      const column = createOrdersTotalDatasetColumn();
      const clickObject = createRawCellClickObject({ column, value: 10 });
      const { drill, drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({ operators: ["<", ">", "=", "≠"] });
      verifyDrillThru(defaultQuery, drill, drillInfo, expectedStageCount);
    });

    it("should drill a cell for a date column", () => {
      const column = createOrdersCreatedAtDatasetColumn();
      const clickObject = createRawCellClickObject({
        column,
        value: "2020-01-01",
      });
      const { drill, drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({ operators: ["<", ">", "=", "≠"] });
      verifyDrillThru(defaultQuery, drill, drillInfo, expectedStageCount);
    });

    it("should drill a cell for a text column", () => {
      const query = Lib.withDifferentTable(defaultQuery, REVIEWS_ID);
      const column = createReviewsReviewerDatasetColumn();
      const clickObject = createRawCellClickObject({
        column,
        value: "text",
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        operators: ["=", "≠"],
      });
      verifyDrillThru(query, drill, drillInfo, expectedStageCount);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill a cell for description or comment columns (metabase#33560)", () => {
      const query = Lib.withDifferentTable(defaultQuery, REVIEWS_ID);
      const column = createReviewsBodyDatasetColumn();
      const clickObject = createRawCellClickObject({
        column,
        value: "text",
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        value: "text",
        operators: ["contains", "does-not-contain"],
      });
      verifyDrillThruDetails(drill, expectedStageCount);
    });

    it("should not drill thru a column header", () => {
      const column = createOrdersTotalDatasetColumn();
      const clickObject = createColumnClickObject({ column });
      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const column = createOrdersTotalDatasetColumn();
      const clickObject = createRawCellClickObject({ column, value: 10 });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("aggregated query", () => {
    const defaultQuery = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
    });
    const expectedStageCount = 2;

    it("should drill thru an aggregated cell", () => {
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
      const { drill, drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        operators: ["<", ">", "=", "≠"],
      });
      verifyDrillThru(defaultQuery, drill, drillInfo, expectedStageCount);
    });
  });
});

function verifyDrillThru(
  query: Lib.Query,
  drill: Lib.DrillThru,
  drillInfo: Lib.DrillThruDisplayInfo,
  expectedStageCount: number,
) {
  verifyDrillThruDetails(drill, expectedStageCount);

  if (drillInfo.type === "drill-thru/quick-filter") {
    drillInfo.operators.forEach(operator => {
      const newQuery = Lib.drillThru(query, -1, drill, operator);
      expect(Lib.filters(newQuery, -1)).toHaveLength(1);
      expect(Lib.stageCount(newQuery)).toBe(expectedStageCount);
    });
  }
}

function verifyDrillThruDetails(
  drill: Lib.DrillThru,
  expectedStageCount: number,
) {
  const drillDetails = Lib.filterDrillDetails(drill);
  const stageCount = Lib.stageCount(drillDetails.query);
  const operators = Lib.filterableColumnOperators(drillDetails.column);
  expect(stageCount).toBe(expectedStageCount);
  expect(operators.length).toBeGreaterThanOrEqual(1);
}
