import {
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { createMockMetadata } from "__support__/metadata";
import {
  createQuery,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";

describe("drill-thru/fk-details", () => {
  const drillType = "drill-thru/fk-details";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill with a FK column value", () => {
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

    it("should not allow to drill with a PK column value", () => {
      const column = createOrdersIdDatasetColumn();
      const value = 10;
      const row = [{ col: column, value }];
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        column,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a non-key column value", () => {
      const column = createOrdersTotalDatasetColumn();
      const value = 10;
      const row = [{ col: column, value }];
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        column,
        value,
        row,
      );

      expect(drill).toBeNull();
    });

    it("should not allow to drill with a FK column itself", () => {
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );

      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to drill with a null FK value (metabase#36133)", () => {
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
      const column = createOrdersProductIdDatasetColumn({
        id: undefined,
        field_ref: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
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
    it("should drill with a FK column", () => {
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
  });
});
