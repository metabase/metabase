import {
  createOrdersIdDatasetColumn,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createOrdersTotalField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
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
    it("should allow to drill when clicked on a value and there are multiple PKs", () => {
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

    it("should not allow to drill when the column is not a PK", () => {
      const value = 10;
      const column = createOrdersTotalDatasetColumn();
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

    it("should not allow to drill when clicked on a column", () => {
      const drill = queryDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        defaultColumn,
      );

      expect(drill).toBeNull();
    });
  });
});
