import type { DrillThruType } from "metabase-lib";
import type { DrillDisplayInfoTestCase } from "metabase-lib/tests/drills-common";
import { getDrillsQueryParameters } from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/underlying-records";

describe("drill-thru/underlying-records", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        expectedParameters: {
          type: "drill-thru/underlying-records",
          rowCount: 77,
          tableName: "Orders",
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "sum",
        expectedParameters: {
          type: "drill-thru/underlying-records",
          rowCount: 1, // This is not really a row count, rather the sum value.
          tableName: "Orders",
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "max",
        expectedParameters: {
          type: "drill-thru/underlying-records",
          rowCount: 2, // max is null in the AGGREGATED_ORDERS_ROW_VALUES; that defaults to 2.
          tableName: "Orders",
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
