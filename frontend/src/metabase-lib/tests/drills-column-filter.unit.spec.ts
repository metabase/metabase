import type { DrillThruType } from "metabase-lib";
import type { DrillDisplayInfoTestCase } from "metabase-lib/tests/drills-common";
import { getDrillsQueryParameters } from "metabase-lib/tests/drills-common";
import { getAvailableDrillByType } from "metabase-lib/test-helpers";

const DRILL_TYPE: DrillThruType = "drill-thru/column-filter";

describe("drill-thru/column-filter", () => {
  describe("availableDrillThrus", () => {
    it.each<DrillDisplayInfoTestCase>([
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "ID",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "USER_ID",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "TAX",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "DISCOUNT",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: null,
        },
      },
      {
        clickType: "header",
        queryType: "unaggregated",
        columnName: "QUANTITY",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "PRODUCT_ID",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "PRODUCT_ID",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "CREATED_AT",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: null,
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "count",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
      },
      {
        clickType: "header",
        queryType: "aggregated",
        columnName: "max",
        expectedParameters: {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
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
