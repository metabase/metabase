import {
  createOrdersCreatedAtDatasetColumn,
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
} from "metabase-lib/tests/drills-common";

describe("drill-thru/zoom", () => {
  const drillType = "drill-thru/zoom";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersIdDatasetColumn();

  it("should drill thru a PK cell when there is only one PK column", () => {
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
    expect(newQuery).not.toBeNull();
  });

  it("should drill thru a non-PK or non-FK cell when there is another PK and no other PK columns exist", () => {
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

  it("should not drill thru a non-PK or non-FK cell when the query is aggregated", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "TOTAL", tableName: "ORDERS" }],
    });
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
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  it("should not drill thru a column header", () => {
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

  it("should not drill thru a FK cell", () => {
    const clickObject = createRawCellClickObject({
      column: createOrdersProductIdDatasetColumn(),
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

  it("should not drill thru a PK cell when there are multiple PK columns", () => {
    const metadata = createMockMetadata({
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
    const query = createQuery({ metadata });
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: 10,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
    const query = createNotEditableQuery(defaultQuery);
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: 10,
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });
});
