import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import type { DrillThruType } from "metabase-lib";
import * as Lib from "metabase-lib";
import {
  ORDERS_COLUMNS,
  ORDERS_COLUMNS_WITH_MULTIPLE_PK,
  ORDERS_QUESTION_WITH_MULTIPLE_PK,
  ORDERS_QUESTION_WITH_MULTIPLE_PK_NOT_EDITABLE,
  ORDERS_ROW_VALUES,
  ORDERS_ROW_VALUES_WITH_MULTIPLE_PK,
} from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/pk";

describe("drill-thru/pk", () => {
  describe("availableDrillThrus", () => {
    it.each<{
      clickType: "cell" | "header";
      columnName: keyof typeof ORDERS_COLUMNS_WITH_MULTIPLE_PK;
      expectedParameters: Lib.DrillThruDisplayInfo;
    }>([
      {
        clickType: "cell",
        columnName: "PRODUCT_ID",
        expectedParameters: {
          type: "drill-thru/pk",
          objectId: ORDERS_ROW_VALUES.PRODUCT_ID as string,
          isManyPks: true,
        },
      },
      {
        clickType: "cell",
        columnName: "USER_ID",
        expectedParameters: {
          type: "drill-thru/pk",
          objectId: ORDERS_ROW_VALUES.USER_ID as string,
          isManyPks: true,
        },
      },
      {
        // FIXME: drill-thru/pk should be returned for query that has multiple PKs on non-PK columns click (metabase#35618)
        clickType: "cell",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/pk",
          objectId: ORDERS_ROW_VALUES.USER_ID as string,
          isManyPks: true,
        },
      },
    ])(
      `should return "$drillType" drill config for $columnName $clickType in $queryType query with multiple PKs`,
      ({ columnName, clickType, expectedParameters }) => {
        const { drillDisplayInfo } = getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType,
          clickedColumnName: columnName,
          question: ORDERS_QUESTION_WITH_MULTIPLE_PK,
          columns: ORDERS_COLUMNS_WITH_MULTIPLE_PK,
          rowValues: ORDERS_ROW_VALUES_WITH_MULTIPLE_PK,
        });

        expect(drillDisplayInfo).toEqual(expectedParameters);
      },
    );

    it(`should not return "${DRILL_TYPE}" drill config for not editable query`, () => {
      expect(() =>
        getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType: "cell",
          clickedColumnName: "PRODUCT_ID",
          question: ORDERS_QUESTION_WITH_MULTIPLE_PK_NOT_EDITABLE,
          columns: ORDERS_COLUMNS,
          rowValues: ORDERS_ROW_VALUES,
        }),
      ).toThrow(`Failed to find ${DRILL_TYPE} drill`);
    });
  });

  describe("drillThru", () => {
    it(`should return correct result on "${DRILL_TYPE}" drill apply to $columnName on $clickType in $queryType query with multiple PKs`, () => {
      const { drill, stageIndex, query } = getAvailableDrillByType({
        drillType: DRILL_TYPE,
        clickType: "cell",
        clickedColumnName: "PRODUCT_ID",
        question: ORDERS_QUESTION_WITH_MULTIPLE_PK,
        columns: ORDERS_COLUMNS_WITH_MULTIPLE_PK,
        rowValues: ORDERS_ROW_VALUES_WITH_MULTIPLE_PK,
      });

      const updatedQuery = Lib.drillThru(query, stageIndex, drill);

      expect(Lib.toLegacyQuery(updatedQuery)).toEqual({
        database: SAMPLE_DB_ID,
        query: {
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
        type: "query",
      });
    });
  });
});
