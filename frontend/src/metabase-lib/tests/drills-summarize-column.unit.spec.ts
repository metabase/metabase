import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
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
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        aggregations: ["distinct", "sum", "avg"],
      });
    });

    it("should allow to drill with a non-summable column", () => {
      const column = createOrdersCreatedAtDatasetColumn();
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        column,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        aggregations: ["distinct"],
      });
    });

    it("should not allow to drill when clicked on a value", () => {
      const value = 10;
      const row = [{ col: defaultColumn, value }];
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill when clicked on a null value", () => {
      const value = null;
      const row = [{ col: defaultColumn, value }];
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        0,
        defaultColumn,
        value,
        row,
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
      const drill = queryDrillThru(drillType, query, stageIndex, column);

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
      const metadata = createMockMetadata({
        databases: [createSampleDatabase({ tables: [] })],
      });
      const query = createQuery({ metadata });
      const drill = queryDrillThru(drillType, query, stageIndex, defaultColumn);
      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it.each<Lib.SummarizeColumnDrillThruOperator>(["distinct", "sum", "avg"])(
      'should drill with a summable column and "%s" operator',
      operator => {
        const { drill } = findDrillThru(
          drillType,
          defaultQuery,
          stageIndex,
          defaultColumn,
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
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        createOrdersCreatedAtDatasetColumn(),
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
