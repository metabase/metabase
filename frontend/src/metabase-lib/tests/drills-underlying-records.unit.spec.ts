import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createLegendItemClickObject,
  createPivotCellClickObject,
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

describe("drill-thru/underlying-records", () => {
  const drillType = "drill-thru/underlying-records";
  const defaultQuery = createQueryWithClauses({
    aggregations: [{ operatorName: "count" }],
    breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
  });
  const stageIndex = 0;
  const aggregationColumn = createCountDatasetColumn();
  const breakoutColumn = createOrdersCreatedAtDatasetColumn({
    source: "breakout",
  });

  it("should drill thru an aggregated cell", () => {
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: aggregationColumn,
        value: 10,
      },
      breakouts: [
        {
          column: breakoutColumn,
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
    expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
    expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("should drill thru a pivot cell (metabase#35394)", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: "CREATED_AT",
          tableName: "ORDERS",
        },
        {
          columnName: "QUANTITY",
          tableName: "ORDERS",
        },
      ],
    });
    const clickObject = createPivotCellClickObject({
      aggregation: {
        column: aggregationColumn,
        value: 10,
      },
      breakouts: [
        {
          column: breakoutColumn,
          value: "2020-01-01",
        },
        {
          column: createOrdersQuantityDatasetColumn({
            source: "breakout",
          }),
          value: 0,
        },
      ],
    });
    const { drill } = findDrillThru(query, stageIndex, clickObject, drillType);
    const newQuery = Lib.drillThru(query, stageIndex, drill);
    expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
    expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
  });

  it("should drill thru a legend item (metabase#35343)", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        { columnName: "CREATED_AT", tableName: "ORDERS" },
        {
          columnName: "QUANTITY",
          tableName: "ORDERS",
        },
      ],
    });
    const clickObject = createLegendItemClickObject({
      column: breakoutColumn,
      value: 10,
    });
    const { drill } = findDrillThru(query, stageIndex, clickObject, drillType);
    const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
    expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(0);
    expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
  });

  it("should use the default row count for aggregations with negative values (metabase#36143)", () => {
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: aggregationColumn,
        value: -10,
      },
      breakouts: [
        {
          column: breakoutColumn,
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
      rowCount: 2,
      tableName: "Orders",
    });
  });

  it("should drill thru an aggregated cell with null value", () => {
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: aggregationColumn,
        value: null,
      },
      breakouts: [
        {
          column: breakoutColumn,
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
      rowCount: 2,
      tableName: "Orders",
    });
  });

  it("should not drill thru a raw query", () => {
    const query = createQuery();
    const column = createOrdersTotalDatasetColumn();
    const clickObject = createRawCellClickObject({ column, value: 10 });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("should not drill thru a non-editable query (metabase#36125)", () => {
    const query = createNotEditableQuery(defaultQuery);
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: aggregationColumn,
        value: 10,
      },
      breakouts: [
        {
          column: breakoutColumn,
          value: "2020-01-01",
        },
      ],
    });
    const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
    expect(drill).toBeNull();
  });
});
