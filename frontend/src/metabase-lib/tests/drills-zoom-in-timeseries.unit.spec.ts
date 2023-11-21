import type { DrillThruType } from "metabase-lib";
import {
  createOrdersCreatedAtDatasetColumn,
  ORDERS,
} from "metabase-types/api/mocks/presets";
import type { DatasetColumn } from "metabase-types/api";
import type { DrillDisplayInfoTestCase } from "metabase-lib/tests/drills-common";
import {
  AGGREGATED_ORDERS_COLUMNS,
  AGGREGATED_ORDERS_DATASET_QUERY,
  getDrillsQueryParameters,
} from "metabase-lib/tests/drills-common";
import {
  getAvailableDrillByType,
  SAMPLE_METADATA,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";

const DRILL_TYPE: DrillThruType = "drill-thru/zoom-in.timeseries";

describe("drill-thru/zoom-in.timeseries", () => {
  describe("availableDrillThrus", () => {
    it.each<
      DrillDisplayInfoTestCase & {
        customColumns?: Record<string, DatasetColumn>;
      }
    >([
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
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "sum",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              breakout: [
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  ORDERS.CREATED_AT,
                  {
                    "base-type": "type/DateTime",
                    "temporal-unit": "year",
                  },
                ],
              ],
            },
          },
        }),
        customColumns: {
          ...AGGREGATED_ORDERS_COLUMNS,
          CREATED_AT: createOrdersCreatedAtDatasetColumn({
            source: "breakout",
            field_ref: [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "year",
              },
            ],
            unit: "year",
          }),
        },
        expectedParameters: {
          displayName: "See this year by quarter",
          type: "drill-thru/zoom-in.timeseries",
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY,
            query: {
              ...AGGREGATED_ORDERS_DATASET_QUERY.query,
              breakout: [
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  ORDERS.CREATED_AT,
                  {
                    "base-type": "type/DateTime",
                    "temporal-unit": "week",
                  },
                ],
              ],
            },
          },
        }),
        customColumns: {
          ...AGGREGATED_ORDERS_COLUMNS,
          CREATED_AT: createOrdersCreatedAtDatasetColumn({
            source: "breakout",
            field_ref: [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "week",
              },
            ],
            unit: "week",
          }),
        },
        expectedParameters: {
          displayName: "See this week by day",
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
        customColumns,
        expectedParameters,
      }) => {
        const { drillDisplayInfo } = getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType,
          clickedColumnName: columnName,
          ...getDrillsQueryParameters(
            queryType,
            queryTable,
            customQuestion,
            customColumns,
          ),
        });

        expect(drillDisplayInfo).toEqual(expectedParameters);
      },
    );
  });
});
