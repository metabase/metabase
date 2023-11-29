import {
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
  findDrillThru,
  queryDrillThru,
} from "metabase-lib/test-helpers";
import {
  createAggregatedQueryWithBreakout,
  createCountColumn,
  createNotEditableQuery,
} from "metabase-lib/tests/drills-common";

describe("drill-thru/zoom", () => {
  const drillType = "drill-thru/zoom";
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const defaultColumn = createOrdersIdDatasetColumn();

  describe("availableDrillThrus", () => {
    it("should allow to drill when there is only one PK", () => {
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
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

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should allow to drill when the column is not a PK or FK and there is another PK (metabase#36129)", () => {
      const clickObject = createRawCellClickObject({
        column: createOrdersTotalDatasetColumn(),
        value: 10,
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

    it("should not allow to drill when the column is not a PK or FK and the query is aggregated", () => {
      const query = createAggregatedQueryWithBreakout({
        aggregationOperatorName: "count",
        breakoutColumnName: "TOTAL",
        breakoutColumnTableName: "ORDERS",
      });
      const clickObject = createAggregatedCellClickObject({
        aggregationColumn: createCountColumn(),
        aggregationColumnValue: 10,
        breakoutColumn: createOrdersTotalDatasetColumn({ source: "breakout" }),
        breakoutColumnValue: 20,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not allow to drill when clicked on a column", () => {
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

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should not allow to drill when clicked on a null value (metabase#36130)", () => {
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

    it("should not allow to drill when the column is a FK", () => {
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

    it("should not allow to drill when clicked on a PK value when there are multiple PKs", () => {
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
    it.skip("should not allow to drill with a non-editable query (metabase#36125)", () => {
      const query = createNotEditableQuery(defaultQuery);
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("drillThru", () => {
    it("should drill with a PK column", () => {
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
      expect(newQuery).toBeDefined();
    });
  });
});
