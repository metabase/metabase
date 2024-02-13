import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import type { DrillThruType } from "metabase-lib";
import { drillThru } from "metabase-lib";
import type {
  ApplyDrillTestCase,
  ApplyDrillTestCaseWithCustomColumn,
  DrillDisplayInfoTestCase,
} from "metabase-lib/tests/drills-common";
import {
  AGGREGATED_ORDERS_DATASET_QUERY,
  getDrillsQueryParameters,
  ORDERS_DATASET_QUERY,
  ORDERS_WITH_CUSTOM_COLUMN_COLUMNS,
  ORDERS_WITH_CUSTOM_COLUMN_DATASET_QUERY,
  ORDERS_WITH_CUSTOM_COLUMN_QUESTION,
  ORDERS_WITH_CUSTOM_COLUMN_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import Question from "metabase-lib/Question";
import {
  getAvailableDrillByType,
  SAMPLE_METADATA,
} from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/sort";

describe("drill-thru/sort", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "ID",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "USER_ID",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "TOTAL",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "TOTAL",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            database: SAMPLE_DB_ID,
            type: "query",
            query: {
              "order-by": [["desc", ["field", ORDERS.TOTAL, null]]],
              "source-table": ORDERS_ID,
            },
          },
        }),
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "CREATED_AT",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
            },
          },
        }),
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["desc"],
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "PRODUCT_ID",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "count",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "count",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
            },
          },
        }),
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "max",
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "CREATED_AT",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
            },
          },
        }),
        expectedParameters: {
          type: "drill-thru/sort",
          directions: ["desc"],
        },
      },
    ])(
      'should return "drill-thru/sort" drill config for $columnName $clickType in $queryType query',
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
        clickType: "header",
        columnName: "ID",
        queryType: "unaggregated",
        drillArgs: ["asc"],
        expectedQuery: {
          ...ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "asc",
              [
                "field",
                ORDERS.ID,
                {
                  "base-type": "type/BigInteger",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "PRODUCT_ID",
        queryType: "unaggregated",
        drillArgs: ["desc"],
        expectedQuery: {
          ...ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "desc",
              [
                "field",
                ORDERS.PRODUCT_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "SUBTOTAL",
        queryType: "unaggregated",
        drillArgs: ["asc"],
        expectedQuery: {
          ...ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "asc",
              [
                "field",
                ORDERS.SUBTOTAL,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "DISCOUNT",
        queryType: "unaggregated",
        drillArgs: ["desc"],
        expectedQuery: {
          ...ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "desc",
              [
                "field",
                ORDERS.DISCOUNT,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "CREATED_AT",
        queryType: "unaggregated",
        drillArgs: ["asc"],
        expectedQuery: {
          ...ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "asc",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "PRODUCT_ID",
        queryType: "aggregated",
        drillArgs: ["desc"],
        expectedQuery: {
          ...AGGREGATED_ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "desc",
              [
                "field",
                ORDERS.PRODUCT_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "CREATED_AT",
        queryType: "aggregated",
        drillArgs: ["asc"],
        expectedQuery: {
          ...AGGREGATED_ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "asc",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
            ],
          ],
        },
      },
      {
        clickType: "header",
        columnName: "sum",
        queryType: "aggregated",
        drillArgs: ["asc"],
        expectedQuery: {
          ...AGGREGATED_ORDERS_DATASET_QUERY.query,
          "order-by": [["asc", ["aggregation", 1]]],
        },
      },
      {
        // should support changing sorting to another direction for a column that already has sorting applied (metabase#34497)

        clickType: "header",
        columnName: "max",
        queryType: "aggregated",
        drillArgs: ["asc"],
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              "order-by": [["desc", ["aggregation", 2]]],
            },
          },
        }),
        expectedQuery: {
          ...AGGREGATED_ORDERS_DATASET_QUERY.query,
          "order-by": [["asc", ["aggregation", 2]]],
        },
      },
      {
        // should support adding extra sorting for a query that already has a sorted column

        clickType: "header",
        columnName: "sum",
        queryType: "aggregated",
        drillArgs: ["asc"],
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              "order-by": [
                [
                  "asc",
                  [
                    "field",
                    ORDERS.CREATED_AT,
                    {
                      "base-type": "type/DateTime",
                      "temporal-unit": "month",
                    },
                  ],
                ],
              ],
            },
          },
        }),
        expectedQuery: {
          ...AGGREGATED_ORDERS_DATASET_QUERY.query,
          "order-by": [
            [
              "asc",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
            ],
            ["asc", ["aggregation", 1]],
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

    describe("with custom column", () => {
      it.each<ApplyDrillTestCaseWithCustomColumn>([
        {
          // should support sorting for custom column
          clickType: "header",
          columnName: "avg",
          drillArgs: ["asc"],
          expectedQuery: {
            ...ORDERS_WITH_CUSTOM_COLUMN_DATASET_QUERY.query,
            "order-by": [["asc", ["aggregation", 3]]],
          },
        },
        {
          // should support sorting for custom column without table relation (metabase#34499)
          clickType: "header",
          columnName: "CustomColumn",
          drillArgs: ["asc"],
          expectedQuery: {
            ...ORDERS_WITH_CUSTOM_COLUMN_DATASET_QUERY.query,
            "order-by": [
              [
                "asc",
                ["expression", "CustomColumn", { "base-type": "type/Integer" }],
              ],
            ],
          },
        },
      ])(
        `should return correct result on "${DRILL_TYPE}" drill apply to $columnName on $clickType in query with custom column`,
        ({
          columnName,
          clickType,
          drillArgs,
          expectedQuery,
          customQuestion,
        }) => {
          const { drill, stageIndex, query } = getAvailableDrillByType({
            drillType: DRILL_TYPE,
            clickType,
            clickedColumnName: columnName,
            question: customQuestion || ORDERS_WITH_CUSTOM_COLUMN_QUESTION,
            columns: ORDERS_WITH_CUSTOM_COLUMN_COLUMNS,
            rowValues: ORDERS_WITH_CUSTOM_COLUMN_ROW_VALUES,
          });

          const updatedQuery = drillThru(
            query,
            stageIndex,
            drill,
            ...(drillArgs || []),
          );

          expect(Lib.toLegacyQuery(updatedQuery)).toEqual({
            database: SAMPLE_DB_ID,
            query: expectedQuery,
            type: "query",
          });
        },
      );
    });
  });
});
