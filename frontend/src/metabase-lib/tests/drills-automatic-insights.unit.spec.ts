import { createMockSettings } from "metabase-types/api/mocks";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
  createProductsCategoryDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
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

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("drill-thru/automatic-insights (metabase#33558)", () => {
  const drillType = "drill-thru/automatic-insights";
  const stageIndex = 0;
  const metadataWithXraysEnabled = createMockMetadata(
    {
      databases: [createSampleDatabase()],
    },
    createMockSettings({
      "enable-xrays": true,
    }),
  );
  const defaultQuery = createQuery({ metadata: metadataWithXraysEnabled });

  describe("raw query", () => {
    const clickObject = createRawCellClickObject({
      column: createOrdersTotalDatasetColumn(),
      value: 10,
    });

    it("should not drill thru a raw query", () => {
      const drill = queryDrillThru(
        defaultQuery,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });
  });

  describe("1 aggregation", () => {
    const query = createQueryWithClauses({
      query: defaultQuery,
      aggregations: [{ operatorName: "count" }],
    });
    const clickObject = createRawCellClickObject({
      column: createCountDatasetColumn(),
      value: 10,
    });

    it("should not drill thru a query without breakouts", () => {
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("1 aggregation, 1 breakout", () => {
    const query = createQueryWithClauses({
      query: defaultQuery,
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
    });
    const clickObject = createAggregatedCellClickObject({
      aggregation: {
        column: createCountDatasetColumn(),
        value: 10,
      },
      breakouts: [
        {
          column: createOrdersCreatedAtDatasetColumn({ source: "breakout" }),
          value: "2020-01-01",
        },
      ],
    });

    it("should drill thru an aggregated cell", () => {
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.filters(newQuery, stageIndex).length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("should not drill a non-editable query", () => {
      const drill = queryDrillThru(
        createNotEditableQuery(query),
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drill).toBeNull();
    });

    it("should not drill a query with x-rays disabled", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [{ columnName: "CREATED_AT", tableName: "ORDERS" }],
      });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });
  });

  describe("1 aggregation, 2 breakouts", () => {
    const query = createQueryWithClauses({
      query: defaultQuery,
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        { columnName: "CREATED_AT", tableName: "ORDERS" },
        { columnName: "CATEGORY", tableName: "PRODUCTS" },
      ],
    });
    const dimensions = {
      aggregation: {
        column: createCountDatasetColumn(),
        value: 10,
      },
      breakouts: [
        {
          column: createOrdersCreatedAtDatasetColumn({ source: "breakout" }),
          value: "2020-01-01",
        },
        {
          column: createProductsCategoryDatasetColumn({ source: "breakout" }),
          value: "Widget",
        },
      ],
    };

    it("should drill thru an aggregated cell", () => {
      const clickObject = createAggregatedCellClickObject(dimensions);
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.filters(newQuery, stageIndex).length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("should drill thru a pivot cell", () => {
      const clickObject = createPivotCellClickObject(dimensions);
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.filters(newQuery, stageIndex).length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it("should drill thru a legend item", () => {
      const clickObject = createLegendItemClickObject(dimensions.breakouts[1]);
      const { drill } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.filters(newQuery, stageIndex).length).toBeGreaterThanOrEqual(
        1,
      );
    });
  });
});
