import {
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createOrdersStructuredColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/sort", () => {
  const drillType = "drill-thru/sort";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();
  const findColumn = columnFinder(
    defaultQuery,
    Lib.orderableColumns(defaultQuery, stageIndex),
  );

  describe("availableDrillThrus", () => {
    it("should allow to drill when the query is not sorted", () => {
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc", "desc"],
      });
    });

    it("should allow to drill when the query is sorted ascending", () => {
      const query = Lib.orderBy(
        defaultQuery,
        stageIndex,
        findColumn("ORDERS", "TOTAL"),
        "asc",
      );
      const { drillInfo } = findDrillThru(
        drillType,
        query,
        stageIndex,
        defaultColumn,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["desc"],
      });
    });

    it("should allow to drill when the query is sorted descending", () => {
      const query = Lib.orderBy(
        defaultQuery,
        stageIndex,
        findColumn("ORDERS", "TOTAL"),
        "desc",
      );
      const { drillInfo } = findDrillThru(
        drillType,
        query,
        stageIndex,
        defaultColumn,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc"],
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
        stageIndex,
        defaultColumn,
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

    it("should not allow to drill with a non-editable query", () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase({ tables: [] })],
      });
      const query = createQuery({ metadata });
      const drill = queryDrillThru(drillType, query, stageIndex, defaultColumn);
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
  });

  describe("drillThru", () => {
    it.each<Lib.OrderByDirection>(["asc", "desc"])(
      'should drill with a non-aggregated query and "%s" direction',
      direction => {
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
          direction,
        );
        expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
      },
    );

    it.each<Lib.OrderByDirection>(["asc", "desc"])(
      'should drill with an aggregated query and "%s" direction',
      direction => {
        const query = Lib.orderBy(
          defaultQuery,
          stageIndex,
          findColumn("ORDERS", "TOTAL"),
          direction === "asc" ? "desc" : "asc",
        );
        const { drill } = findDrillThru(
          drillType,
          query,
          stageIndex,
          defaultColumn,
        );
        const newQuery = Lib.drillThru(query, stageIndex, drill, direction);
        expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
      },
    );
  });
});
