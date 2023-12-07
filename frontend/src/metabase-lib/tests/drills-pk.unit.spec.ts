import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersCreatedAtField,
  createOrdersIdDatasetColumn,
  createOrdersIdField,
  createOrdersProductIdDatasetColumn,
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersTotalDatasetColumn,
  createOrdersTotalField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createColumnClickObject,
  createQuery,
  createRawCellClickObject,
  createQueryWithClauses,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
} from "./drills-common";

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
              createOrdersCreatedAtField(),
            ],
          }),
        ],
      }),
    ],
  });
  const defaultQuery = createQuery({ metadata: defaultMetadata });
  const stageIndex = 0;
  const defaultColumn = createOrdersIdDatasetColumn();

  it("should drill thru a PK cell when there are multiple PK columns", () => {
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: 10,
    });
    const { drill } = findDrillThru(
      defaultQuery,
      stageIndex,
      clickObject,
      drillType,
    );
    const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
    expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
  });

  it("should drill thru a non-PK and non-FK cell when there are multiple PK columns", () => {
    const clickObject = createRawCellClickObject({
      column: createOrdersTotalDatasetColumn(),
      value: 10,
      data: [
        {
          col: createOrdersIdDatasetColumn(),
          value: 1,
        },
        {
          col: createOrdersProductIdDatasetColumn({ semantic_type: "type/PK" }),
          value: 2,
        },
        {
          col: createOrdersTotalDatasetColumn(),
          value: 10,
        },
        {
          col: createOrdersCreatedAtDatasetColumn(),
          value: "2020-01-01",
        },
      ],
    });
    const { drill } = findDrillThru(
      defaultQuery,
      stageIndex,
      clickObject,
      drillType,
    );
    const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
    expect(Lib.filters(newQuery, stageIndex)).toHaveLength(2);
  });

  it("should not drill thru a non-PK and non-FK cell when the query is aggregated", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "TOTAL", tableName: "ORDERS" }],
    });
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: createCountDatasetColumn(),
        value: 20,
      },
      breakouts: [
        {
          column: createOrdersTotalDatasetColumn({ source: "breakout" }),
          value: 10,
        },
      ],
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  it("should not drill thru a FK cell", () => {
    const query = createQuery();
    const clickObject = createRawCellClickObject({
      column: createOrdersProductIdDatasetColumn(),
      value: 10,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  it("should not drill thru the only PK cell", () => {
    const query = createQuery();
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: 10,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  it("should not drill thru a FK column", () => {
    const clickObject = createColumnClickObject({
      column: defaultColumn,
    });
    const drill = queryDrillThru(
      defaultQuery,
      stageIndex,
      clickObject,
      drillType,
    );
    expect(drill).toBeNull();
  });

  it("should not drill thru a PK cell with null value", () => {
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
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: 10,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });
});
