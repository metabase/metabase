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
  DrillDisplayInfoTestCase,
} from "metabase-lib/tests/drills-common";
import { getDrillsQueryParameters } from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/summarize-column";

describe("drill-thru/summarize-column", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "ID",
        expectedParameters: {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "USER_ID",
        expectedParameters: {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "SUBTOTAL",
        expectedParameters: {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct", "sum", "avg"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct"],
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "QUANTITY",
        expectedParameters: {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct", "sum", "avg"],
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
        clickType: "header",
        queryType: "unaggregated",
        columnName: "ID",
        drillArgs: ["distinct"],
        expectedQuery: {
          aggregation: [
            [
              "distinct",
              [
                "field",
                ORDERS.ID,
                {
                  "base-type": "type/BigInteger",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "PRODUCT_ID",
        queryType: "unaggregated",
        drillArgs: ["distinct"],
        expectedQuery: {
          aggregation: [
            [
              "distinct",
              [
                "field",
                ORDERS.PRODUCT_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "SUBTOTAL",
        queryType: "unaggregated",
        drillArgs: ["distinct"],
        expectedQuery: {
          aggregation: [
            [
              "distinct",
              [
                "field",
                ORDERS.SUBTOTAL,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "TAX",
        queryType: "unaggregated",
        drillArgs: ["sum"],
        expectedQuery: {
          aggregation: [
            [
              "sum",
              [
                "field",
                ORDERS.TAX,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "DISCOUNT",
        queryType: "unaggregated",
        drillArgs: ["avg"],
        expectedQuery: {
          aggregation: [
            [
              "avg",
              [
                "field",
                ORDERS.DISCOUNT,
                {
                  "base-type": "type/Float",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "CREATED_AT",
        queryType: "unaggregated",
        drillArgs: ["distinct"],
        expectedQuery: {
          aggregation: [
            [
              "distinct",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "QUANTITY",
        queryType: "unaggregated",
        drillArgs: ["avg"],
        expectedQuery: {
          aggregation: [
            [
              "avg",
              [
                "field",
                ORDERS.QUANTITY,
                {
                  "base-type": "type/Integer",
                },
              ],
            ],
          ],
          "source-table": ORDERS_ID,
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
