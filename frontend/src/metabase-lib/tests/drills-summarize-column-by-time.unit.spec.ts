import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createOrdersTotalField,
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

describe("drill-thru/summarize-column-by-time", () => {
  const drillType = "drill-thru/summarize-column-by-time";
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
      });
    });

    it("should not allow to drill with a non-summable column", () => {
      const column = createOrdersCreatedAtDatasetColumn();
      const drill = queryDrillThru(drillType, defaultQuery, stageIndex, column);
      expect(drill).toBeNull();
    });

    it("should not allow to drill when there is no date column", () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            tables: [
              createOrdersTable({
                fields: [createOrdersIdField(), createOrdersTotalField()],
              }),
            ],
          }),
        ],
      });
      const query = createQuery({ metadata });
      const drill = queryDrillThru(drillType, query, stageIndex, defaultColumn);
      expect(drill).toBeNull();
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
    it("should drill with a summable column", () => {
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
