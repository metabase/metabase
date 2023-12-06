import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersCreatedAtField,
  createOrdersIdDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createProductsCategoryDatasetColumn,
  createSampleDatabase,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  createColumnClickObject,
  createRawCellClickObject,
  queryDrillThru,
  createQueryWithClauses,
  createAggregatedCellClickObject,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
  createOrdersCommentDatasetColumn,
  createOrdersCommentField,
  createOrdersDescriptionDatasetColumn,
  createOrdersDescriptionField,
  createOrdersSerializedJSONDatasetColumn,
  createOrdersSerializedJSONField,
} from "./drills-common";

describe("drill-thru/distribution", () => {
  const drillType = "drill-thru/distribution";
  const stageIndex = 0;

  describe("raw query", () => {
    const defaultQuery = createQuery();
    const defaultColumn = createOrdersTotalDatasetColumn();

    it("should drill thru a numeric column", () => {
      const clickObject = createColumnClickObject({
        column: createOrdersTotalDatasetColumn(),
      });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill thru a date column", () => {
      const clickObject = createColumnClickObject({
        column: createOrdersCreatedAtDatasetColumn(),
      });
      const { drill } = findDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill thru a text column", () => {
      const query = Lib.withDifferentTable(defaultQuery, PRODUCTS_ID);
      const clickObject = createColumnClickObject({
        column: createProductsCategoryDatasetColumn(),
      });
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
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

    it("should not drill thru a PK column", () => {
      const clickObject = createColumnClickObject({
        column: createOrdersIdDatasetColumn(),
      });
      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createColumnClickObject({
        column: defaultColumn,
      });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it.each([
      {
        field: createOrdersCreatedAtField(),
        column: createOrdersIdDatasetColumn(),
      },
      {
        field: createOrdersSerializedJSONField(),
        column: createOrdersSerializedJSONDatasetColumn(),
      },
      {
        field: createOrdersDescriptionField(),
        column: createOrdersDescriptionDatasetColumn(),
      },
      {
        field: createOrdersCommentField(),
        column: createOrdersCommentDatasetColumn(),
      },
    ])(
      'should not thru a "$field.semantic_type" column',
      ({ field, column }) => {
        const metadata = createMockMetadata({
          databases: [
            createSampleDatabase({
              tables: [
                createOrdersTable({
                  fields: [createOrdersIdField(), field],
                }),
              ],
            }),
          ],
        });
        const query = createQuery({ metadata });
        const clickObject = createColumnClickObject({ column });
        const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
        expect(drill).toBeNull();
      },
    );
  });

  describe("aggregated query", () => {
    const defaultQuery = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "TOTAL", tableName: "ORDERS" }],
    });

    it("should not drill thru an aggregated column", () => {
      const clickObject = createAggregatedCellClickObject({
        aggregation: {
          column: createCountDatasetColumn(),
          value: 10,
        },
        breakouts: [
          {
            column: createOrdersTotalDatasetColumn({ source: "breakout" }),
            value: 20,
          },
        ],
      });
      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });
  });
});
