import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersCreatedAtField,
  createOrdersIdDatasetColumn,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createQuery,
  findDrillThru,
  createColumnClickObject,
  createRawCellClickObject,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createNotEditableQuery,
  createOrdersCommentColumn,
  createOrdersCommentField,
  createOrdersDescriptionColumn,
  createOrdersDescriptionField,
  createOrdersSerializedJSONColumn,
  createOrdersSerializedJSONField,
} from "./drills-common";

describe("drill-thru/distribution", () => {
  const drillType = "drill-thru/distribution";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersTotalDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill when clicked on a column header", () => {
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
      });
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

  it('should not allow to drill with "type/PK" type', () => {
    const clickObject = createColumnClickObject({
      column: createOrdersIdDatasetColumn(),
    });

    const { drillInfo } = findDrillThru(
      defaultQuery,
      stageIndex,
      clickObject,
      drillType,
    );

    expect(drillInfo).toMatchObject({
      type: drillType,
    });
  });

  it("should not allow to drill with a non-editable query (metabase#36125)", () => {
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
      const clickObject = createColumnClickObject({ column });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

      expect(drill).toBeNull();
    },
  );

  describe("drillThru", () => {
    it("should drill with a numeric column", () => {
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

    it("should drill with a date column", () => {
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

    it("should drill with a text column (metabase#36124)", () => {
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
      const clickObject = createColumnClickObject({
        column: createOrdersCommentColumn(),
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
  });
});
