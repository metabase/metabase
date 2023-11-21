import type { DrillThruType } from "metabase-lib";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import {
  createOrdersCreatedAtDatasetColumn,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import type {
  DrillDisplayInfoTestCase,
  ApplyDrillTestCase,
} from "metabase-lib/tests/drills-common";
import {
  getDrillsQueryParameters,
  ORDERS_COLUMNS,
  ORDERS_QUESTION,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import {
  getAvailableDrillByType,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";

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
          rowCount: 1,
          tableName: "Orders",
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "max",
        expectedParameters: {
          type: "drill-thru/underlying-records",
          rowCount: 2,
          tableName: "Orders",
        },
      },
      {
        // FIXME: underlying-records doesn't resolve tableName when query source is a saved question (metabase#35340)
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        customQuestion: Question.create({
          metadata: createMockMetadata({
            databases: [SAMPLE_DATABASE],
            questions: [
              createMockCard({
                id: 2,
                name: "CA People",
                dataset_query: {
                  type: "query",
                  database: SAMPLE_DB_ID,
                  query: { "source-table": ORDERS_ID, limit: 5 },
                },
              }),
            ],
          }),
          dataset_query: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              aggregation: [["count"]],
              breakout: [
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
              ],
              "source-table": "card__2",
            },
          },
        }),
        expectedParameters: {
          type: "drill-thru/underlying-records",
          rowCount: 77,
          tableName: "CA People",
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

    it(`should not return "${DRILL_TYPE}" drill config for top level query`, () => {
      expect(() =>
        getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType: "cell",
          clickedColumnName: "PRODUCT_ID",
          question: ORDERS_QUESTION,
          columns: ORDERS_COLUMNS,
          rowValues: ORDERS_ROW_VALUES,
        }),
      ).toThrow(`Failed to find ${DRILL_TYPE} drill`);
    });
  });

  describe("drillThru", () => {
    it.each<
      ApplyDrillTestCase & {
        customColumns?: Record<string, DatasetColumn>;
        customRowValues?: Record<string, RowValue>;
      }
    >([
      {
        clickType: "cell",
        columnName: "max",
        queryType: "aggregated",
        expectedQuery: {
          filter: [
            "and",
            [
              "=",
              [
                "field",
                ORDERS.PRODUCT_ID,
                {
                  "base-type": "type/Integer",
                },
              ],
              3,
            ],
            [
              "=",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
              "2022-12-01T00:00:00+02:00",
            ],
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                [
                  "field",
                  ORDERS.CREATED_AT,
                  {
                    "base-type": "type/DateTime",
                    "temporal-unit": "day-of-week",
                  },
                ],
              ],
            },
          },
        }),
        customColumns: {
          CREATED_AT: createOrdersCreatedAtDatasetColumn({
            source: "breakout",
            field_ref: [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "day-of-week",
              },
            ],
            unit: "day-of-week",
          }),
          count: createMockColumn({
            base_type: "type/BigInteger",
            name: "count",
            display_name: "Count",
            semantic_type: "type/Quantity",
            source: "aggregation",
            field_ref: ["aggregation", 0],
            effective_type: "type/BigInteger",
          }),
        },
        customRowValues: {
          CREATED_AT: 3,
          count: 77,
        },
        expectedQuery: {
          filter: [
            "=",
            [
              "field",
              ORDERS.CREATED_AT,
              { "temporal-unit": "day-of-week", "base-type": "type/DateTime" },
            ],
            3,
          ],
          "source-table": ORDERS_ID,
        },
      },
      {
        clickType: "cell",
        queryType: "aggregated",
        columnName: "count",
        customQuestion: Question.create({
          metadata: SAMPLE_METADATA,
          dataset_query: {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              joins: [
                {
                  strategy: "left-join",
                  alias: "People - User",
                  condition: [
                    "=",
                    [
                      "field",
                      ORDERS.USER_ID,
                      {
                        "base-type": "type/Integer",
                      },
                    ],
                    [
                      "field",
                      PEOPLE.ID,
                      {
                        "base-type": "type/BigInteger",
                        "join-alias": "People - User",
                      },
                    ],
                  ],
                  "source-table": PEOPLE_ID,
                },
              ],
              aggregation: [["count"]],
              breakout: [
                [
                  "field",
                  PEOPLE.STATE,
                  {
                    "base-type": "type/Text",
                    "join-alias": "People - User",
                  },
                ],
              ],
            },
          },
        }),
        customColumns: {
          STATE: createMockColumn({
            description:
              "The state or province of the account’s billing address",
            semantic_type: "type/State",
            table_id: PEOPLE_ID,
            coercion_strategy: null,
            name: "STATE",
            source: "breakout",
            fk_target_field_id: null,
            field_ref: [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/Text",
                "join-alias": "People - User",
              },
            ],
            effective_type: "type/Text",
            id: PEOPLE.STATE,
            visibility_type: "normal",
            display_name: "People - User → State",
            fingerprint: {
              global: {
                "distinct-count": 49,
                "nil%": 0,
              },
              type: {
                "type/Text": {
                  "percent-json": 0,
                  "percent-url": 0,
                  "percent-email": 0,
                  "percent-state": 1,
                  "average-length": 2,
                },
              },
            },
            base_type: "type/Text",
          }),
          count: createMockColumn({
            base_type: "type/BigInteger",
            name: "count",
            display_name: "Count",
            semantic_type: "type/Quantity",
            source: "aggregation",
            field_ref: ["aggregation", 0],
            effective_type: "type/BigInteger",
          }),
        },
        customRowValues: {
          STATE: "AZ",
          count: 77,
        },
        expectedQuery: {
          "source-table": ORDERS_ID,
          joins: [
            {
              strategy: "left-join",
              alias: "People - User",
              condition: [
                "=",
                [
                  "field",
                  ORDERS.USER_ID,
                  {
                    "base-type": "type/Integer",
                  },
                ],
                [
                  "field",
                  PEOPLE.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "People - User",
                  },
                ],
              ],
              "source-table": PEOPLE_ID,
            },
          ],
          filter: [
            "=",
            [
              "field",
              PEOPLE.STATE,
              {
                "base-type": "type/Text",
              },
            ],
            "AZ",
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
        customColumns,
        customRowValues,
      }) => {
        const { drill, stageIndex, query } = getAvailableDrillByType({
          drillType: DRILL_TYPE,
          clickType,
          clickedColumnName: columnName,
          ...getDrillsQueryParameters(
            queryType,
            queryTable,
            customQuestion,
            customColumns,
            customRowValues,
          ),
        });

        const updatedQuery = Lib.drillThru(
          query,
          stageIndex,
          drill,
          ...drillArgs,
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
