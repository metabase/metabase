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
  createQueryWithClauses,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createNotEditableQuery,
  createOrdersStructuredDatasetColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/sort", () => {
  const drillType = "drill-thru/sort";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  it.each<Lib.OrderByDirection>(["asc", "desc"])(
    'should drill thru a column header from a non-sorted query with "%s" direction',
    direction => {
      const clickObject = createColumnClickObject({ column: defaultColumn });
      const { drill, drillInfo } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        directions: ["asc", "desc"],
      });

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
    'should drill thru a column header from a sorted query with "%s" direction',
    direction => {
      const query = createQueryWithClauses({
        orderBys: [
          {
            columnName: "TOTAL",
            tableName: "ORDERS",
            direction: direction === "asc" ? "desc" : "asc",
          },
        ],
      });
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        directions: [direction],
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill, direction);
      expect(Lib.orderBys(newQuery, stageIndex)).toHaveLength(1);
    },
  );

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

  it("should not drill thru a cell with null value", () => {
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

  it("should not drill thru a non-editable query", () => {
    const query = createNotEditableQuery(defaultQuery);
    const clickObject = createColumnClickObject({
      column: defaultColumn,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
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
});
