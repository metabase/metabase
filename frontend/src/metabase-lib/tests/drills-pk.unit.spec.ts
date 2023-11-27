import {
  createOrdersIdDatasetColumn,
  createOrdersIdField,
  createOrdersProductIdDatasetColumn,
  createOrdersProductIdField,
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

describe("drill-thru/pk", () => {
  const drillType = "drill-thru/pk";
  const defaultMetadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable({
            fields: [
              createOrdersIdField(),
              createOrdersProductIdField({ semantic_type: "type/PK" }),
              createOrdersTotalField(),
            ],
          }),
        ],
      }),
    ],
  });
  const defaultQuery = createQuery({ metadata: defaultMetadata });
  const stageIndex = 0;
  const defaultColumn = createOrdersIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill when clicked on a PK value and there are multiple PKs", () => {
      const value = 10;
      const row = [{ col: defaultColumn, value }];
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
        value,
        row,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
      });
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should allow to drill when the column is not a PK but there are multiple other PK columns (metabase#35618)", () => {
      const value = 10;
      const column = createOrdersTotalDatasetColumn();
      const row = [{ col: column, value }];
      const { drillInfo } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        column,
        value,
        row,
      );

      expect(drillInfo).toMatchObject({
        type: drillType,
      });
    });

    it("should not allow to drill when the column is a FK", () => {
      const query = createQuery();
      const column = createOrdersProductIdDatasetColumn();
      const value = 10;
      const row = [{ col: column, value }];
      const drill = queryDrillThru(
        drillType,
        query,
        stageIndex,
        column,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill when there is only one PK", () => {
      const query = createQuery();
      const value = 10;
      const row = [{ col: defaultColumn, value }];
      const drill = queryDrillThru(
        drillType,
        query,
        stageIndex,
        defaultColumn,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill when clicked on a column", () => {
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );

      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to drill when clicked on a null value (metabase#36126)", () => {
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

    it("should not allow to drill with a non-editable query", () => {
      const metadata = createMockMetadata({
        databases: [createSampleDatabase({ tables: [] })],
      });
      const query = createQuery({ metadata });
      const drill = queryDrillThru(drillType, query, stageIndex, defaultColumn);
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
      const column = createOrdersIdDatasetColumn({
        id: undefined,
        field_ref: ["field", "ID", { "base-type": "type/Integer" }],
      });
      const drill = queryDrillThru(drillType, query, stageIndex, column);
      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it("should drill with a PK column", () => {
      const value = 10;
      const row = [{ col: defaultColumn, value }];
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
        value,
        row,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill with a non-PK column (metabase#35618)", () => {
      const value = 10;
      const column = createOrdersTotalDatasetColumn();
      const row = [{ col: column, value }];
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        column,
        value,
        row,
      );

      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
