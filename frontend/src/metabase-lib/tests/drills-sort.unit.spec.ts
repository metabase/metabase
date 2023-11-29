import {
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
  createOrderedQuery,
  createOrdersStructuredColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/sort", () => {
  const drillType = "drill-thru/sort";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill when the query is not sorted", () => {
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
        directions: ["asc", "desc"],
      });
    });

    it("should allow to drill when the query is sorted ascending", () => {
      const query = createOrderedQuery({
        columnName: "TOTAL",
        columnTableName: "ORDERS",
        direction: "asc",
      });
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });

      const { drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["desc"],
      });
    });

    it("should allow to drill when the query is sorted descending", () => {
      const query = createOrderedQuery({
        columnName: "TOTAL",
        columnTableName: "ORDERS",
        direction: "desc",
      });
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });

      const { drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
        directions: ["asc"],
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

    it("should not allow to drill with a non-editable query", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

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
  });

  describe("drillThru", () => {
    it.each<Lib.OrderByDirection>(["asc", "desc"])(
      'should drill with a non-aggregated query and "%s" direction',
      direction => {
        const clickObject = createColumnClickObject({ column: defaultColumn });
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
          direction,
        );

        expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
      },
    );

    it.each<Lib.OrderByDirection>(["asc", "desc"])(
      'should drill with an aggregated query and "%s" direction',
      direction => {
        const query = createOrderedQuery({
          columnName: "TOTAL",
          columnTableName: "ORDERS",
          direction: direction === "asc" ? "desc" : "asc",
        });
        const clickObject = createColumnClickObject({
          column: defaultColumn,
        });
        const { drill } = findDrillThru(
          query,
          stageIndex,
          clickObject,
          drillType,
        );

        const newQuery = Lib.drillThru(query, stageIndex, drill, direction);

        expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
      },
    );
  });
});
