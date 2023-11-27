import {
  createOrdersTotalDatasetColumn,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { COLUMNS, METADATA } from "./drills-common";

describe("drill-thru/sort", () => {
  const drillType = "drill-thru/sort";
  const initialQuery = createQuery();
  const stageIndex = 0;
  const column = createOrdersTotalDatasetColumn();
  const findColumn = columnFinder(
    initialQuery,
    Lib.orderableColumns(initialQuery, stageIndex),
  );

  describe("availableDrillThrus", () => {
    it("should allow to drill when the query is not sorted", () => {
      const { drillInfo } = findDrillThru(
        drillType,
        initialQuery,
        stageIndex,
        column,
      );
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc", "desc"],
      });
    });

    it("should allow to drill when the query is sorted ascending", () => {
      const query = Lib.orderBy(
        initialQuery,
        stageIndex,
        findColumn("ORDERS", "TOTAL"),
        "asc",
      );
      const { drillInfo } = findDrillThru(drillType, query, stageIndex, column);
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["desc"],
      });
    });

    it("should allow to drill when the query is sorted descending", () => {
      const query = Lib.orderBy(
        initialQuery,
        stageIndex,
        findColumn("ORDERS", "TOTAL"),
        "desc",
      );
      const { drillInfo } = findDrillThru(drillType, query, stageIndex, column);
      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc"],
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

    it("should not allow to drill with a non-editable query", () => {
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

    it('should not allow to drill with "type/Structured" type', () => {
      const query = createQuery({
        metadata: METADATA,
      });

      const drill = queryDrillThru(
        drillType,
        query,
        stageIndex,
        COLUMNS.structured,
      );

      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it.each<Lib.OrderByDirection>(["asc", "desc"])(
      'should drill with a non-aggregated query and "%s" direction',
      direction => {
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
          direction,
        );
        expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
      },
    );

    it.each<Lib.OrderByDirection>(["asc", "desc"])(
      'should drill with an aggregated query and "%s" direction',
      direction => {
        const query = Lib.orderBy(
          initialQuery,
          stageIndex,
          findColumn("ORDERS", "TOTAL"),
          direction === "asc" ? "desc" : "asc",
        );
        const { drill } = findDrillThru(drillType, query, stageIndex, column);
        const newQuery = Lib.drillThru(query, stageIndex, drill, direction);
        expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
      },
    );
  });
});
