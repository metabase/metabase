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

const DRILL_TYPE: DrillThruType = "drill-thru/summarize-column-by-time";

describe("drill-thru/summarize-column-by-time", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "SUBTOTAL",
        expectedParameters: {
          type: "drill-thru/summarize-column-by-time",
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "DISCOUNT",
        expectedParameters: {
          type: "drill-thru/summarize-column-by-time",
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "QUANTITY",
        expectedParameters: {
          type: "drill-thru/summarize-column-by-time",
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
        columnName: "TAX",
        queryType: "unaggregated",
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
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "header",
        columnName: "QUANTITY",
        queryType: "unaggregated",
        expectedQuery: {
          aggregation: [
            [
              "sum",
              [
                "field",
                ORDERS.QUANTITY,
                {
                  "base-type": "type/Integer",
                },
              ],
            ],
          ],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
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
