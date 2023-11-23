import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";

describe("drill-thru/summarize-column", () => {
  const drillType = "drill-thru/summarize-column";
  const initialQuery = createQuery();
  const stageIndex = 0;
  const column = createOrdersTotalDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a summable column", () => {
      const { drillInfo } = findDrillThru(
        drillType,
        initialQuery,
        stageIndex,
        column,
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
        initialQuery,
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
      const row = [{ col: column, value }];
      const drill = queryDrillThru(
        drillType,
        initialQuery,
        stageIndex,
        column,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill when clicked on a null value", () => {
      const value = null;
      const row = [{ col: column, value }];
      const drill = queryDrillThru(
        drillType,
        initialQuery,
        0,
        column,
        value,
        row,
      );

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

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to drill with a non-editable query", () => {
      const query = createQuery({
        query: {
          type: "query",
          database: 100,
          query: { "source-table": 101 },
        },
      });
      const column = createOrdersTotalDatasetColumn({
        id: 102,
        field_ref: ["field", 102, { "base-type": "type/Float" }],
      });
      const drill = queryDrillThru(drillType, query, stageIndex, column);
      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it.each<Lib.SummarizeColumnDrillThruOperator>(["distinct", "sum", "avg"])(
      'should drill with a summable column and "%s" operator',
      operator => {
        const { drill } = findDrillThru(
          drillType,
          initialQuery,
          stageIndex,
          column,
        );
        const newQuery = Lib.drillThru(
          initialQuery,
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
        initialQuery,
        stageIndex,
        createOrdersCreatedAtDatasetColumn(),
      );
      const newQuery = Lib.drillThru(
        initialQuery,
        stageIndex,
        drill,
        "distinct",
      );
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
