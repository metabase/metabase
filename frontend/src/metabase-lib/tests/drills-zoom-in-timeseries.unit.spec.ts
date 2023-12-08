import type { DatetimeUnit } from "metabase-types/api";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersQuantityDatasetColumn,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import {
  createAggregatedCellClickObject,
  createColumnClickObject,
  createLegendItemClickObject,
  createPivotCellClickObject,
  findDrillThru,
  queryDrillThru,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import {
  createCountDatasetColumn,
  createNotEditableQuery,
} from "./drills-common";

describe("drill-thru/zoom-in.timeseries (metabase#36173)", () => {
  const drillType = "drill-thru/zoom-in.timeseries";
  const stageIndex = 0;
  const aggregationColumn = createCountDatasetColumn();
  const breakoutColumn = createOrdersCreatedAtDatasetColumn({
    source: "breakout",
  });

  describe.each([
    {
      bucketName: "Year",
      unit: "year",
      displayName: "See this year by quarter",
    },
    {
      bucketName: "Quarter",
      unit: "quarter",
      displayName: "See this quarter by month",
    },
    {
      bucketName: "Month",
      unit: "month",
      displayName: "See this month by week",
    },
    { bucketName: "Day", unit: "day", displayName: "See this day by hour" },
    {
      bucketName: "Hour",
      unit: "hour",
      displayName: "See this hour by minute",
    },
  ])("$bucketName", ({ bucketName, unit, displayName }) => {
    it("should drill thru an aggregated cell", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: breakoutColumn.name,
            tableName: "ORDERS",
            temporalBucketName: bucketName,
          },
        ],
      });
      const clickObject = createAggregatedCellClickObject({
        aggregation: {
          column: aggregationColumn,
          value: 10,
        },
        breakouts: [
          {
            // QP results metadata will come back with the temporal unit like this
            column: { ...breakoutColumn, unit: unit as DatetimeUnit },
            value: "2020-01-01",
          },
        ],
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        displayName,
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill thru a pivot cell", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: "CREATED_AT",
            tableName: "ORDERS",
            temporalBucketName: bucketName,
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
            column: { ...breakoutColumn, unit: unit as DatetimeUnit },
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
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        displayName,
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should drill thru a legend item", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: "CREATED_AT",
            tableName: "ORDERS",
            temporalBucketName: bucketName,
          },
          {
            columnName: "QUANTITY",
            tableName: "ORDERS",
          },
        ],
      });
      const clickObject = createLegendItemClickObject({
        column: { ...breakoutColumn, unit: unit as DatetimeUnit },
        value: "2020-01-01",
      });
      const { drill, drillInfo } = findDrillThru(
        query,
        stageIndex,
        clickObject,
        drillType,
      );
      expect(drillInfo).toMatchObject({
        displayName,
      });

      const newQuery = Lib.drillThru(query, stageIndex, drill);
      expect(Lib.aggregations(newQuery, stageIndex)).toHaveLength(1);
      expect(Lib.filters(newQuery, stageIndex)).toHaveLength(1);
    });

    it("should not drill thru a column header", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
        breakouts: [
          {
            columnName: breakoutColumn.name,
            tableName: "ORDERS",
            temporalBucketName: bucketName,
          },
        ],
      });
      const clickObject = createColumnClickObject({
        column: aggregationColumn,
      });
      const drill = queryDrillThru(query, stageIndex, clickObject, drillType);
      expect(drill).toBeNull();
    });

    it("should not drill thru a non-editable query", () => {
      const query = createNotEditableQuery(
        createQueryWithClauses({
          aggregations: [{ operatorName: "count" }],
          breakouts: [
            {
              columnName: breakoutColumn.name,
              tableName: "ORDERS",
              temporalBucketName: bucketName,
            },
          ],
        }),
      );
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

  it.each([
    "Minute",
    "Minute of hour",
    "Hour of day",
    "Day of week",
    "Day of month",
    "Day of year",
    "Week of year",
    "Month of year",
    "Quarter of year",
    "Don't bin",
  ])('should not drill thru with "%s" temporal bucket', bucketName => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: breakoutColumn.name,
          tableName: "ORDERS",
          temporalBucketName: bucketName,
        },
      ],
    });
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
