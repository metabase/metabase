import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createColumnClickObject,
  createQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createNotEditableQuery,
  createOrdersStructuredColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/summarize-column", () => {
  const drillType = "drill-thru/summarize-column";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a summable column", () => {
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        aggregations: ["distinct", "sum", "avg"],
      });
    });

    it("should allow to drill with a non-summable column", () => {
      const clickObject = createColumnClickObject({
        column: createOrdersCreatedAtDatasetColumn(),
      });

      const { drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        aggregations: ["distinct"],
      });
    });

    it("should not allow to drill when clicked on a value", () => {
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

    it("should not allow to drill when clicked on a null value", () => {
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

    it('should not allow to drill with "type/Structured" type', () => {
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
      const column = createOrdersStructuredColumn();
      const clickObject = createColumnClickObject({ column });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it.each<Lib.SummarizeColumnDrillThruOperator>(["distinct", "sum", "avg"])(
      'should drill with a summable column and "%s" operator',
      operator => {
        const clickObject = createColumnClickObject({
          column: defaultColumn,
        });
        const { drill } = findDrillThru(
          defaultQuery,
          stageIndex,
          clickObject,
          drillType,
        );
        const newQuery = Lib.drillThru(
          defaultQuery,
          stageIndex,
          drill,
          operator,
        );

        expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      },
    );

    it('should drill with a non-summable column and "distinct" operator', () => {
      const clickedObject = createColumnClickObject({
        column: createOrdersCreatedAtDatasetColumn(),
      });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickedObject,
        drillType,
      );

      const newQuery = Lib.drillThru(
        defaultQuery,
        stageIndex,
        drill,
        "distinct",
      );

      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
