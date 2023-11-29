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
    it("should allow to drill when clicked on a PK value and there are multiple PKs", () => {
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
    it.skip("should allow to drill when the column is not a PK or FK and there are multiple other PK columns (metabase#35618)", () => {
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
        aggregationColumnValue: 20,
        breakoutColumn: createOrdersTotalDatasetColumn({ source: "breakout" }),
        breakoutColumnValue: 10,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

      expect(drill).toBeNull();
    });

    it("should not allow to drill when the column is a FK", () => {
      const query = createQuery();
      const clickObject = createRawCellClickObject({
        column: createOrdersProductIdDatasetColumn(),
        value: 10,
      });

      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);

      expect(drill).toBeNull();
    });

    it("should not allow to drill when there is only one PK", () => {
      const query = createQuery();
      const clickObject = createRawCellClickObject({
        column: defaultColumn,
        value: 10,
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
    it.skip("should not allow to drill when clicked on a null value (metabase#36126)", () => {
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

    it("should not allow to drill with a non-editable query", () => {
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

      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should drill with a non-PK column (metabase#35618)", () => {
      const clickObject = createRawCellClickObject({
        column: createOrdersTotalDatasetColumn(),
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
});
