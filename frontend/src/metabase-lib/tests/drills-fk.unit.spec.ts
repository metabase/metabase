import {
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersTotalDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createColumnClickObject,
  createQuery,
  createRawCellClickObject,
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import { createNotEditableQuery } from "./drills-common";

describe("drill-thru/fk-details", () => {
  const drillType = "drill-thru/fk-details";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  it("should drill thru a FK cell", () => {
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
});

describe("drill-thru/fk-filter", () => {
  const drillType = "drill-thru/fk-filter";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  it("should drill thru a FK cell", () => {
    const clickObject = createRawCellClickObject({
      column: defaultColumn,
      value: 10,
    });
    const { drill, drillInfo } = findDrillThru(
      defaultQuery,
      stageIndex,
      clickObject,
      drillType,
    );
    expect(drillInfo).toMatchObject({
      type: drillType,
      tableName: "Orders",
      columnName: "Product ID",
    });

    const newQuery = Lib.drillThru(defaultQuery, stageIndex, drill);
    expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
  });
});

describe.each<Lib.DrillThruType>([
  "drill-thru/fk-filter",
  "drill-thru/fk-details",
])("%s", drillType => {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersProductIdDatasetColumn();

  it("should not drill thru a PK cell", () => {
    const clickObject = createRawCellClickObject({
      column: createOrdersIdDatasetColumn(),
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

  it("should not drill thru a non-PK or non-FK cell", () => {
    const clickObject = createRawCellClickObject({
      column: createOrdersTotalDatasetColumn(),
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

  it("should not drill thru a FK cell with null", () => {
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
