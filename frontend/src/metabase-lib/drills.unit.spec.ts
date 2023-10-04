import * as Lib from "metabase-lib";
import {
  createOrdersCreatedAtDatasetColumn,
  createOrdersDiscountDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersProductIdDatasetColumn,
  createOrdersQuantityDatasetColumn,
  createOrdersSubtotalDatasetColumn,
  createOrdersTaxDatasetColumn,
  createOrdersTotalDatasetColumn,
  createOrdersUserIdDatasetColumn,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockColumn } from "metabase-types/api/mocks";
import type {
  DatasetColumn,
  RowValue,
  StructuredDatasetQuery,
} from "metabase-types/api";
import type { StructuredQuery as StructuredQueryApi } from "metabase-types/api/query";
import type {
  ColumnFilterDrillThruInfo,
  DistributionDrillThruInfo,
  DrillThru,
  DrillThruDisplayInfo,
  DrillThruType,
  FKDetailsDrillThruInfo,
  FKFilterDrillThruInfo,
  Query,
  QuickFilterDrillThruInfo,
  SortDrillThruInfo,
  SummarizeColumnByTimeDrillThruInfo,
  SummarizeColumnDrillThruInfo,
  UnderlyingRecordsDrillThruInfo,
  ZoomDrillThruInfo,
} from "metabase-lib/types";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Question from "metabase-lib/Question";
import { SAMPLE_METADATA } from "./test-helpers";
import { availableDrillThrus, drillThru } from "./drills";

const ORDERS_QUESTION = Question.create({
  databaseId: SAMPLE_DB_ID,
  tableId: ORDERS_ID,
  metadata: SAMPLE_METADATA,
});

type TestCaseConfig<T extends string> = [T, DrillThruDisplayInfo[]];

const ORDERS_COLUMNS = {
  ID: createOrdersIdDatasetColumn(),
  USER_ID: createOrdersUserIdDatasetColumn(),
  PRODUCT_ID: createOrdersProductIdDatasetColumn(),
  SUBTOTAL: createOrdersSubtotalDatasetColumn(),
  TAX: createOrdersTaxDatasetColumn(),
  TOTAL: createOrdersTotalDatasetColumn(),
  DISCOUNT: createOrdersDiscountDatasetColumn(),
  CREATED_AT: createOrdersCreatedAtDatasetColumn(),
  QUANTITY: createOrdersQuantityDatasetColumn(),
};
const ORDERS_ROW_VALUES: Record<keyof typeof ORDERS_COLUMNS, string | number> =
  {
    ID: "3",
    USER_ID: "1",
    PRODUCT_ID: "105",
    SUBTOTAL: 52.723521442619514,
    TAX: 2.9,
    TOTAL: 49.206842233769756,
    DISCOUNT: 6.416679208849759,
    CREATED_AT: "2025-12-06T22:22:48.544+02:00",
    QUANTITY: 2,
  };
describe("availableDrillThrus", () => {
  describe("should return list of available drills", () => {
    describe("unaggregated query", () => {
      it.each<TestCaseConfig<keyof typeof ORDERS_COLUMNS>>([
        [
          "ID",
          [
            {
              type: "drill-thru/zoom",
              objectId: ORDERS_ROW_VALUES.ID,
              "manyPks?": false,
            } as ZoomDrillThruInfo,
          ],
        ],

        [
          "USER_ID",
          [
            {
              type: "drill-thru/fk-filter",
            } as FKFilterDrillThruInfo,
            {
              type: "drill-thru/fk-details",
              objectId: ORDERS_ROW_VALUES.USER_ID,
              "manyPks?": false,
            } as FKDetailsDrillThruInfo,
          ],
        ],

        [
          "SUBTOTAL",
          [
            {
              type: "drill-thru/zoom",
              objectId: ORDERS_ROW_VALUES.ID,
              "manyPks?": false,
            } as ZoomDrillThruInfo,
            {
              type: "drill-thru/quick-filter",
              operators: ["<", ">", "=", "≠"],
            } as QuickFilterDrillThruInfo,
          ],
        ],

        [
          "CREATED_AT",
          [
            {
              type: "drill-thru/zoom",
              objectId: ORDERS_ROW_VALUES.ID,
              "manyPks?": false,
            } as ZoomDrillThruInfo,
            {
              type: "drill-thru/quick-filter",
              operators: ["<", ">", "=", "≠"],
            } as QuickFilterDrillThruInfo,
          ],
        ],
      ])("ORDERS -> %s cell click", (clickedColumnName, expectedDrills) => {
        const { query, stageIndex, column, cellValue, row } = setup({
          clickedColumnName,
          columns: ORDERS_COLUMNS,
          rowValues: ORDERS_ROW_VALUES,
        });

        const drills = availableDrillThrus(
          query,
          stageIndex,
          column,
          cellValue,
          row,
          undefined,
        );

        expect(
          drills.map(drill => Lib.displayInfo(query, stageIndex, drill)),
        ).toEqual(expectedDrills);
      });

      it.each<TestCaseConfig<keyof typeof ORDERS_COLUMNS>>([
        [
          "ID",
          [
            {
              initialOp: expect.objectContaining({ short: "=" }),
              type: "drill-thru/column-filter",
            } as ColumnFilterDrillThruInfo,
            {
              directions: ["asc", "desc"],
              type: "drill-thru/sort",
            } as SortDrillThruInfo,
            {
              aggregations: ["distinct"],
              type: "drill-thru/summarize-column",
            } as SummarizeColumnDrillThruInfo,
          ],
        ],
        [
          "PRODUCT_ID",
          [
            {
              type: "drill-thru/distribution",
            } as DistributionDrillThruInfo,
            {
              initialOp: expect.objectContaining({ short: "=" }),
              type: "drill-thru/column-filter",
            } as ColumnFilterDrillThruInfo,
            {
              directions: ["asc", "desc"],
              type: "drill-thru/sort",
            } as SortDrillThruInfo,
            {
              aggregations: ["distinct"],
              type: "drill-thru/summarize-column",
            } as SummarizeColumnDrillThruInfo,
          ],
        ],
        [
          "SUBTOTAL",
          [
            { type: "drill-thru/distribution" } as DistributionDrillThruInfo,
            {
              type: "drill-thru/column-filter",
              initialOp: expect.objectContaining({ short: "=" }),
            } as ColumnFilterDrillThruInfo,
            {
              type: "drill-thru/sort",
              directions: ["asc", "desc"],
            } as SortDrillThruInfo,
            {
              type: "drill-thru/summarize-column",
              aggregations: ["distinct", "sum", "avg"],
            } as SummarizeColumnDrillThruInfo,
            {
              type: "drill-thru/summarize-column-by-time",
            } as SummarizeColumnByTimeDrillThruInfo,
          ],
        ],
        [
          "CREATED_AT",
          [
            { type: "drill-thru/distribution" } as DistributionDrillThruInfo,
            {
              type: "drill-thru/column-filter",
              initialOp: null,
            } as ColumnFilterDrillThruInfo,
            {
              type: "drill-thru/sort",
              directions: ["asc", "desc"],
            } as SortDrillThruInfo,
            {
              type: "drill-thru/summarize-column",
              aggregations: ["distinct"],
            } as SummarizeColumnDrillThruInfo,
          ],
        ],
      ])("ORDERS -> %s header click", (clickedColumnName, expectedDrills) => {
        const { query, stageIndex, column } = setup({
          clickedColumnName,
          columns: ORDERS_COLUMNS,
          rowValues: ORDERS_ROW_VALUES,
        });

        const drills = availableDrillThrus(
          query,
          stageIndex,
          column,
          undefined,
          undefined,
          undefined,
        );

        expect(
          drills.map(drill => Lib.displayInfo(query, stageIndex, drill)),
        ).toEqual(expectedDrills);
      });
    });

    // FIXME MLv2 returns distribution drill for aggregated query, which is does not match current behavior on stats
    // eslint-disable-next-line jest/no-disabled-tests
    describe.skip("aggregated query", () => {
      const COLUMNS = {
        PRODUCT_ID: createOrdersProductIdDatasetColumn({
          source: "breakout",
          field_ref: [
            "field",
            ORDERS.PRODUCT_ID,
            {
              "base-type": "type/Integer",
            },
          ],
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
      };
      const ROW_VALUES = {
        PRODUCT_ID: 3,
        count: 77,
      };
      const QUESTION = Question.create({
        databaseId: SAMPLE_DB_ID,
        tableId: ORDERS_ID,
        metadata: SAMPLE_METADATA,
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
            ],
          },
        },
      });

      it.each<TestCaseConfig<keyof typeof COLUMNS>>([
        [
          "count",
          [
            {
              type: "drill-thru/quick-filter",
              operators: ["<", ">", "=", "≠"],
            } as QuickFilterDrillThruInfo,
            {
              type: "drill-thru/underlying-records",
              rowCount: 77,
              tableName: "Orders",
            } as UnderlyingRecordsDrillThruInfo,
          ],
        ],
        [
          "PRODUCT_ID",
          [
            {
              type: "drill-thru/fk-filter",
            } as FKFilterDrillThruInfo,
            {
              type: "drill-thru/fk-details",
              objectId: ROW_VALUES.PRODUCT_ID,
              "manyPks?": false,
            } as FKDetailsDrillThruInfo,
          ],
        ],
      ])("ORDERS -> %s cell click", (clickedColumnName, expectedDrills) => {
        const { query, stageIndex, column, cellValue, row } = setup({
          question: QUESTION,
          clickedColumnName,
          columns: COLUMNS,
          rowValues: ROW_VALUES,
        });

        const dimensions = row
          .filter(
            ({ col }) =>
              col.source === "breakout" && col.name !== clickedColumnName,
          )
          .map(({ value, col }) => ({ value, column: col }));

        const drills = availableDrillThrus(
          query,
          stageIndex,
          column,
          cellValue,
          row,
          dimensions.length ? dimensions : undefined,
        );

        expect(
          drills.map(drill => Lib.displayInfo(query, stageIndex, drill)),
        ).toEqual(expectedDrills);
      });

      it.each<TestCaseConfig<keyof typeof COLUMNS>>([
        [
          "count",
          [
            {
              initialOp: expect.objectContaining({ short: "=" }),
              type: "drill-thru/column-filter",
            } as ColumnFilterDrillThruInfo,
            {
              directions: ["asc", "desc"],
              type: "drill-thru/sort",
            } as SortDrillThruInfo,
          ],
        ],
        [
          "PRODUCT_ID",
          [
            {
              initialOp: expect.objectContaining({ short: "=" }),
              type: "drill-thru/column-filter",
            } as ColumnFilterDrillThruInfo,
            {
              directions: ["asc", "desc"],
              type: "drill-thru/sort",
            } as SortDrillThruInfo,
          ],
        ],
      ])("ORDERS -> %s header click", (clickedColumnName, expectedDrills) => {
        const { query, stageIndex, column } = setup({
          question: QUESTION,
          clickedColumnName,
          columns: COLUMNS,
          rowValues: ROW_VALUES,
        });

        const drills = availableDrillThrus(
          query,
          stageIndex,
          column,
          undefined,
          undefined,
          undefined,
        );

        expect(
          drills.map(drill => Lib.displayInfo(query, stageIndex, drill)),
        ).toEqual(expectedDrills);
      });
    });

    // FIXME MLv2 throws runtime error when we have a custom expression column
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should return list of available drills for aggregated query with custom column", () => {
      const question = Question.create({
        databaseId: SAMPLE_DB_ID,
        tableId: ORDERS_ID,
        metadata: SAMPLE_METADATA,
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            expressions: { CustomColumn: ["+", 1, 1] },
            aggregation: [["count"]],
            breakout: [
              ["expression", "CustomColumn"],
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
          parameters: [],
        } as StructuredDatasetQuery,
      });
      const columns = {
        Math: createMockColumn({
          base_type: "type/Integer",
          name: "Math",
          display_name: "Math",
          expression_name: "Math",
          field_ref: ["expression", "Math"],
          source: "breakout",
          effective_type: "type/Integer",
        }),
        CREATED_AT: createOrdersCreatedAtDatasetColumn({
          source: "breakout",
          field_ref: [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
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
      };
      const rowValues = {
        Math: 2,
        CREATED_AT: "2022-06-01T00:00:00+03:00",
        count: 37,
      };
      const clickedColumnName = "count";

      const { query, stageIndex, column, cellValue, row } = setup({
        question,
        clickedColumnName,
        columns,
        rowValues,
      });

      const dimensions = row
        .filter(({ col }) => col?.name !== clickedColumnName)
        .map(({ value, col }) => ({ value, column: col }));

      const drills = availableDrillThrus(
        query,
        stageIndex,
        column,
        cellValue,
        row,
        dimensions,
      );

      expect(drills).toBeInstanceOf(Array);
    });
  });
});

describe("drillThru", () => {
  it.each<{
    drillType: DrillThruType;
    clickType: "cell" | "header";
    columnName: string;
    drillArgs?: any[];
    expectedQuery: StructuredQueryApi;
  }>([
    // FIXME: sort drill is not yet implemented on the BE side
    // {
    //   drillType: "drill-thru/sort",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.ID.name,
    //   drillArgs: ["asc"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/sort",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.PRODUCT_ID.name,
    //   drillArgs: ["desc"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/sort",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.SUBTOTAL.name,
    //   drillArgs: ["asc"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/sort",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.DISCOUNT.name,
    //   drillArgs: ["desc"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/sort",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.CREATED_AT.name,
    //   drillArgs: ["asc"],
    //   expectedQuery: {},
    // },

    // FIXME: summarize-column drill does not work due to metabase#33480
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.ID.name,
    //   drillArgs: ["distinct"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.PRODUCT_ID.name,
    //   drillArgs: ["distinct"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.SUBTOTAL.name,
    //   drillArgs: ["distinct"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.TAX.name,
    //   drillArgs: ["sum"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.DISCOUNT.name,
    //   drillArgs: ["avg"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.CREATED_AT.name,
    //   drillArgs: ["distinct"],
    //   expectedQuery: {},
    // },
    // {
    //   drillType: "drill-thru/summarize-column",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.QUANTITY.name,
    //   drillArgs: ["avg"],
    //   expectedQuery: {},
    // },

    // FIXME: distribution drill does not work on FK columns
    // {
    //   drillType: "drill-thru/distribution",
    //   clickType: "header",
    //   columnName: ORDERS_COLUMNS.USER_ID.name,
    //   expectedQuery: {
    //     aggregation: [["count"]],
    //     breakout: [["field", ORDERS.USER_ID, null]],
    //     "source-table": ORDERS_ID,
    //   },
    // },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      columnName: ORDERS_COLUMNS.SUBTOTAL.name,
      expectedQuery: {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.SUBTOTAL,
            {
              "base-type": "type/Float",
              binning: {
                strategy: "default",
              },
            },
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      columnName: ORDERS_COLUMNS.CREATED_AT.name,
      expectedQuery: {
        aggregation: [["count"]],
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
      drillType: "drill-thru/summarize-column-by-time",
      clickType: "header",
      columnName: ORDERS_COLUMNS.TAX.name,
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
      drillType: "drill-thru/summarize-column-by-time",
      clickType: "header",
      columnName: ORDERS_COLUMNS.QUANTITY.name,
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

    // FIXME: cell quick-filter drill doesn't work yet with a simple operator like "=", seems we need to implement MLv2 Filters first
    // {
    //   drillType: "drill-thru/quick-filter",
    //   clickType: "cell",
    //   columnName: ORDERS_COLUMNS.SUBTOTAL.name,
    //   drillArgs: ["="],
    //   expectedQuery: {},
    // },

    {
      drillType: "drill-thru/fk-filter",
      clickType: "cell",
      columnName: ORDERS_COLUMNS.USER_ID.name,
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
      drillType: "drill-thru/fk-filter",
      clickType: "cell",
      columnName: ORDERS_COLUMNS.PRODUCT_ID.name,
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
    'should apply "$drillType" drill to $columnName on $clickType click',
    ({ drillType, columnName, clickType, expectedQuery, drillArgs = [] }) => {
      const { query, stageIndex, column, cellValue, row } = setup({
        question: ORDERS_QUESTION,
        clickedColumnName: columnName,
        columns: ORDERS_COLUMNS,
        rowValues: ORDERS_ROW_VALUES,
      });

      const drills =
        clickType === "cell"
          ? availableDrillThrus(
              query,
              stageIndex,
              column,
              cellValue,
              row,
              undefined,
            )
          : availableDrillThrus(
              query,
              stageIndex,
              column,
              undefined,
              undefined,
              undefined,
            );

      const drill = findDrillByType(drills, drillType, query, stageIndex);

      const updatedQuery = drillThru(query, stageIndex, drill, ...drillArgs);

      expect(Lib.toLegacyQuery(updatedQuery)).toEqual({
        database: SAMPLE_DB_ID,
        query: expectedQuery,
        type: "query",
      });
    },
  );
});

function setup({
  question = ORDERS_QUESTION,
  clickedColumnName,
  columns,
  rowValues,
}: {
  question?: Question;
  clickedColumnName: string;
  columns: Record<string, DatasetColumn>;
  rowValues: Record<string, RowValue>;
}) {
  const query = question._getMLv2Query();
  const legacyQuery = question.query() as StructuredQuery;

  const stageIndex = -1;

  const legacyColumns = legacyQuery.columns();

  return {
    query,
    stageIndex,
    column: columns[clickedColumnName],
    cellValue: rowValues[clickedColumnName],
    row: legacyColumns.map(({ name }) => ({
      col: columns[name],
      value: rowValues[name],
    })),
  };
}

function findDrillByType(
  drills: DrillThru[],
  drillType: DrillThruType,
  query: Query,
  stageIndex: number,
): DrillThru {
  const drill = drills.find(
    drill => Lib.displayInfo(query, stageIndex, drill)?.type === drillType,
  );

  if (!drill) {
    throw new TypeError();
  }

  return drill;
}
