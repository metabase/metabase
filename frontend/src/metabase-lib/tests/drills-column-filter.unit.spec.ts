import {
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  createColumnClickObject,
  createRawCellClickObject,
  queryDrillThru,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
  createOrdersStructuredDatasetColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/column-filter", () => {
  const drillType = "drill-thru/column-filter";
  const stageIndex = 0;

  describe("raw query", () => {
    const defaultQuery = createQuery();
    const defaultColumn = createOrdersTotalDatasetColumn();
    const expectedStageCount = 1;

    it("should drill thru a column header", () => {
      const clickObject = createColumnClickObject({ column: defaultColumn });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).not.toBeNull();
      verifyDrillThruDetails(drill, expectedStageCount);
    });

    it("should not drill thru a cell", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });
      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });

    it("should not drill thru a cell with null", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: null,
      });
      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });

    it("should not drill thru a Structured column", () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            tables: [
              createOrdersTable({
                fields: [createOrdersIdField(), createOrdersStructuredField()],
              }),
            ],
          }),
        ],
      });
      const query = createQuery({ metadata });
      const column = createOrdersStructuredDatasetColumn();
      const clickObject = createColumnClickObject({ column });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createColumnClickObject({ column: defaultColumn });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("aggregated query", () => {
    const defaultQuery = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
    });
    const defaultColumn = createCountDatasetColumn();
    const expectedStageCount = 2;

    it("should drill thru an aggregated cell", () => {
      const clickObject = createColumnClickObject({ column: defaultColumn });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).not.toBeNull();
      verifyDrillThruDetails(drill, expectedStageCount);
    });
  });
});

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
