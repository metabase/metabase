import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersCreatedAtField,
  createOrdersIdDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
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
  createOrdersCommentColumn,
  createOrdersCommentField,
  createOrdersDescriptionColumn,
  createOrdersDescriptionField,
  createOrdersSerializedJSONColumn,
  createOrdersSerializedJSONField,
} from "metabase-lib/tests/drills-common";

describe("drill-thru/distribution", () => {
  const drillType = "drill-thru/distribution";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill when clicked on a column header", () => {
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

  it('should not allow to drill with "type/PK" type', () => {
    const column = createOrdersIdDatasetColumn();
    const drill = queryDrillThru(drillType, defaultQuery, stageIndex, column);
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

  it.each([
    {
      field: createOrdersCreatedAtField(),
      column: createOrdersIdDatasetColumn(),
    },
    {
      field: createOrdersSerializedJSONField(),
      column: createOrdersSerializedJSONColumn(),
    },
    {
      field: createOrdersDescriptionField(),
      column: createOrdersDescriptionColumn(),
    },
    {
      field: createOrdersCommentField(),
      column: createOrdersCommentColumn(),
    },
  ])(
    'should not allow to drill with "$field.semantic_type" type',
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
      const drill = queryDrillThru(drillType, query, stageIndex, column);

      expect(drill).toBeNull();
    },
  );

  describe("drillThru", () => {
    it("should drill with a numeric column", () => {
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

    it("should drill with a date column", () => {
      const { drill } = findDrillThru(
        drillType,
        defaultQuery,
        stageIndex,
        createOrdersCreatedAtDatasetColumn(),
      );
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill with a text column", () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            tables: [
              createOrdersTable({
                fields: [createOrdersIdField(), createOrdersCommentField()],
              }),
            ],
          }),
        ],
      });
      const query = createQuery({ metadata });
      const column = createOrdersCommentColumn();

      const { drill } = findDrillThru(drillType, query, stageIndex, column);
      const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);

      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, stageIndex)).toHaveLength(1);
    });
  });
});
