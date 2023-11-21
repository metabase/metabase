import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import type { DrillThruType } from "metabase-lib";
import { drillThru } from "metabase-lib";
import type { ComparisonFilter } from "metabase-types/api";
import type {
  ApplyDrillTestCase,
  DrillDisplayInfoTestCase,
} from "metabase-lib/tests/drills-common";
import {
  AGGREGATED_ORDERS_DATASET_QUERY,
  AGGREGATED_ORDERS_ROW_VALUES,
  getDrillsQueryParameters,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/quick-filter";

describe("drill-thru/quick-filter", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "SUBTOTAL",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "DISCOUNT",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["=", "≠"],
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "QUANTITY",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      },

      {
        // quick-filter doesn't get returned for CREATED_AT column in aggregated query (metabase#34443)
        clickType: "cell",
        queryType: "aggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "sum",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      },
      {
        // quick-filter returns extra "<", ">" operators for cell with no value (metabase#34445)
        clickType: "cell",
        queryType: "aggregated",
        columnName: "max",
        expectedParameters: {
          type: "drill-thru/quick-filter",
          operators: ["=", "≠"],
        },
      },
    ])(
      `should return "${DRILL_TYPE}" drill config for $columnName $clickType in $queryType query`,
      ({
        columnName,
        clickType,
        queryType,
        queryTable = "ORDERS",
        customQuestion,
        expectedParameters,
      }) => {
        const { drillDisplayInfo } = getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType,
          clickedColumnName: columnName,
          ...getDrillsQueryParameters(queryType, queryTable, customQuestion),
        });

        expect(drillDisplayInfo).toEqual(expectedParameters);
      },
    );
  });

  describe("drillThru", () => {
    it.each<ApplyDrillTestCase>([
      {
        clickType: "cell",
        columnName: "SUBTOTAL",
        queryType: "unaggregated",
        drillArgs: ["="],
        expectedQuery: {
          filter: [
            "=",
            [
              "field",
              ORDERS.SUBTOTAL,
              {
                "base-type": "type/Float",
              },
            ],
            ORDERS_ROW_VALUES.SUBTOTAL,
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        // filter gets applied on the same query stage as aggregations, but it should wrap the query (metabase#34346)
        clickType: "cell",
        columnName: "sum",
        queryType: "aggregated",
        drillArgs: ["="],
        expectedQuery: {
          "source-query": AGGREGATED_ORDERS_DATASET_QUERY.query,
          filter: [
            "=",
            [
              "field",
              "sum",
              {
                "base-type": "type/Float",
              },
            ],
            AGGREGATED_ORDERS_ROW_VALUES.sum,
          ],
        },
      },
      {
        clickType: "cell",
        columnName: "CREATED_AT",
        queryType: "aggregated",
        drillArgs: ["<"],
        expectedQuery: {
          ...AGGREGATED_ORDERS_DATASET_QUERY.query,
          filter: [
            "<",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
            ],
            AGGREGATED_ORDERS_ROW_VALUES.CREATED_AT,
          ] as ComparisonFilter,
        },
      },
      {
        clickType: "cell",
        columnName: "max",
        queryType: "aggregated",
        drillArgs: ["≠"],
        expectedQuery: {
          "source-query": AGGREGATED_ORDERS_DATASET_QUERY.query,
          filter: [
            "not-null",
            [
              "field",
              "max",
              {
                "base-type": "type/Float",
              },
            ],
          ],
        },
      },
    ])(
      `should return correct result on "${DRILL_TYPE}" drill apply to $columnName on $clickType in $queryType query`,
      ({
        columnName,
        clickType,
        queryType,
        queryTable,
        customQuestion,
        drillArgs = [],
        expectedQuery,
      }) => {
        const { drill, stageIndex, query } = getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType,
          clickedColumnName: columnName,
          ...getDrillsQueryParameters(queryType, queryTable, customQuestion),
        });

        const updatedQuery = drillThru(query, stageIndex, drill, ...drillArgs);

        expect(Lib.toLegacyQuery(updatedQuery)).toEqual({
          database: SAMPLE_DB_ID,
          query: expectedQuery,
          type: "query",
        });
      },
    );
  });
});
