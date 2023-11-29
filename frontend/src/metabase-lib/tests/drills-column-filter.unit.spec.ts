import {
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import {
  createQuery,
  findDrillThru,
  createColumnClickObject,
  createRawCellClickObject,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createNotEditableQuery,
  createOrdersStructuredDatasetColumn,
  createOrdersStructuredField,
} from "./drills-common";

describe("drill-thru/column-filter", () => {
  const drillType = "drill-thru/column-filter";
  const stageIndex = 0;

  describe("raw query", () => {
    const defaultQuery = createQuery();
    const defaultColumn = createOrdersTotalDatasetColumn();

    it("should drill thru a column", () => {
      const clickObject = createColumnClickObject({ column: defaultColumn });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeDefined();
    });

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

    it("should not drill thru a cell with null", () => {
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

    it("should not drill thru a JSON column", () => {
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

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createColumnClickObject({ column: defaultColumn });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });
});
