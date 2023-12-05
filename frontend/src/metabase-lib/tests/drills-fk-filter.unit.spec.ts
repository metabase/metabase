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
import {
  getDrillsQueryParameters,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/fk-filter";

describe("drill-thru/fk-filter", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "USER_ID",
        expectedParameters: {
          type: "drill-thru/fk-filter",
          tableName: "Orders",
          columnName: "User ID",
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "PRODUCT_ID",
        expectedParameters: {
          type: "drill-thru/fk-filter",
          tableName: "Orders",
          columnName: "Product ID",
        },
      },
      {
        // `fk-filter` doesn't get returned for fk column that was used as breakout (metabase#34440)
        clickType: "cell",
        queryType: "aggregated",
        columnName: "PRODUCT_ID",
        expectedParameters: {
          type: "drill-thru/fk-filter",
          tableName: "Orders",
          columnName: "Product ID",
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
        columnName: "USER_ID",
        queryType: "unaggregated",
        expectedQuery: {
          filter: [
            "=",
            [
              "field",
              ORDERS.USER_ID,
              {
                "base-type": "type/Integer",
              },
            ],
            ORDERS_ROW_VALUES.USER_ID,
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "cell",
        columnName: "PRODUCT_ID",
        queryType: "unaggregated",
        expectedQuery: {
          filter: [
            "=",
            [
              "field",
              ORDERS.PRODUCT_ID,
              {
                "base-type": "type/Integer",
              },
            ],
            ORDERS_ROW_VALUES.PRODUCT_ID,
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
