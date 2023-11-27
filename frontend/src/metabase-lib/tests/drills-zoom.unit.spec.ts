import type { DrillThruType } from "metabase-lib";
import type { DrillDisplayInfoTestCase } from "metabase-lib/tests/drills-common";
import {
  getDrillsQueryParameters,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/zoom";

describe("drill-thru/zoom", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "ID",
        expectedParameters: {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "TAX",
        expectedParameters: {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "DISCOUNT",
        expectedParameters: {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
      },
      {
        clickType: "cell",
        queryType: "unaggregated",
        columnName: "QUANTITY",
        expectedParameters: {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
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
});
