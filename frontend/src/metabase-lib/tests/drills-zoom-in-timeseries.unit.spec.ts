import type { DrillThruType } from "metabase-lib";
import type { DrillDisplayInfoTestCase } from "metabase-lib/tests/drills-common";
import { getDrillsQueryParameters } from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/zoom-in.timeseries";

describe("drill-thru/zoom-in.timeseries", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        // "zoom-in.timeseries" should be returned for aggregated query metric click (metabase#33811)
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        expectedParameters: {
          displayName: "See this month by week",
          type: "drill-thru/zoom-in.timeseries",
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "max",
        expectedParameters: {
          displayName: "See this month by week",
          type: "drill-thru/zoom-in.timeseries",
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "sum",
        expectedParameters: {
          displayName: "See this month by week",
          type: "drill-thru/zoom-in.timeseries",
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
