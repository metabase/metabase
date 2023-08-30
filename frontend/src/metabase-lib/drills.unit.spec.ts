import * as Lib from "metabase-lib";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockColumn } from "metabase-types/api/mocks";
import type { DatasetColumn, RowValue } from "metabase-types/api";
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
import { columnFinder, createQuery, SAMPLE_METADATA } from "./test-helpers";
import { availableDrillThrus, drillThru } from "./drills";

const setup = ({
  question = Question.create({
    databaseId: SAMPLE_DB_ID,
    tableId: ORDERS_ID,
    metadata: SAMPLE_METADATA,
  }),
  clickedColumnName,
  columns,
  rowValues,
}: {
  question?: Question;
  clickedColumnName: string;
  columns: Record<string, DatasetColumn>;
  rowValues: Record<string, RowValue>;
}) => {
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
};

type TestCaseConfig<T extends string> = [T, DrillThruDisplayInfo[]];

describe("availableDrillThrus", () => {
  describe("should return list of available drills", () => {
    describe("unaggregated query", () => {
      const COLUMNS = {
        ID: createMockColumn({
          description:
            "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
          semantic_type: "type/PK",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "ID",
          source: "fields",
          field_ref: ["field", ORDERS.ID, null],
          effective_type: "type/BigInteger",
          id: ORDERS.ID,
          visibility_type: "normal",
          display_name: "ID",
          fingerprint: null,
          base_type: "type/BigInteger",
        }),
        USER_ID: createMockColumn({
          description:
            "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
          semantic_type: "type/FK",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "USER_ID",
          source: "fields",
          field_ref: ["field", ORDERS.USER_ID, null],
          effective_type: "type/Integer",
          id: ORDERS.USER_ID,
          visibility_type: "normal",
          display_name: "User ID",
          fingerprint: {
            global: {
              "distinct-count": 929,
              "nil%": 0,
            },
          },
          base_type: "type/Integer",
        }),
        PRODUCT_ID: createMockColumn({
          description:
            "The product ID. This is an internal identifier for the product, NOT the SKU.",
          semantic_type: "type/FK",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "PRODUCT_ID",
          source: "fields",
          field_ref: ["field", ORDERS.PRODUCT_ID, null],
          effective_type: "type/Integer",
          id: ORDERS.PRODUCT_ID,
          visibility_type: "normal",
          display_name: "Product ID",
          fingerprint: {
            global: {
              "distinct-count": 200,
              "nil%": 0,
            },
          },
          base_type: "type/Integer",
        }),
        SUBTOTAL: createMockColumn({
          description:
            "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "SUBTOTAL",
          source: "fields",
          field_ref: ["field", ORDERS.SUBTOTAL, null],
          effective_type: "type/Float",
          id: ORDERS.SUBTOTAL,
          visibility_type: "normal",
          display_name: "Subtotal",
          fingerprint: {
            global: {
              "distinct-count": 340,
              "nil%": 0,
            },
            type: {
              "type/Number": {
                min: 15.691943673970439,
                q1: 49.74894519060184,
                q3: 105.42965746993103,
                max: 148.22900526552291,
                sd: 32.53705013056317,
                avg: 77.01295465356547,
              },
            },
          },
          base_type: "type/Float",
        }),
        TAX: createMockColumn({
          description:
            "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "TAX",
          source: "fields",
          field_ref: ["field", ORDERS.TAX, null],
          effective_type: "type/Float",
          id: ORDERS.TAX,
          visibility_type: "normal",
          display_name: "Tax",
          fingerprint: {
            global: {
              "distinct-count": 797,
              "nil%": 0,
            },
            type: {
              "type/Number": {
                min: 0,
                q1: 2.273340386603857,
                q3: 5.337275338216307,
                max: 11.12,
                sd: 2.3206651358900316,
                avg: 3.8722100000000004,
              },
            },
          },
          base_type: "type/Float",
        }),
        TOTAL: createMockColumn({
          description: "The total billed amount.",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "TOTAL",
          source: "fields",
          field_ref: ["field", ORDERS.TOTAL, null],
          effective_type: "type/Float",
          id: ORDERS.TOTAL,
          visibility_type: "normal",
          display_name: "Total",
          fingerprint: {
            global: {
              "distinct-count": 4426,
              "nil%": 0,
            },
            type: {
              "type/Number": {
                min: 8.93914247937167,
                q1: 51.34535490743823,
                q3: 110.29428389265787,
                max: 159.34900526552292,
                sd: 34.26469575709948,
                avg: 80.35871658771228,
              },
            },
          },
          base_type: "type/Float",
        }),
        DISCOUNT: createMockColumn({
          description: "Discount amount.",
          semantic_type: "type/Discount",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "DISCOUNT",
          source: "fields",
          field_ref: ["field", ORDERS.DISCOUNT, null],
          effective_type: "type/Float",
          id: ORDERS.DISCOUNT,
          visibility_type: "normal",
          display_name: "Discount",
          fingerprint: {
            global: {
              "distinct-count": 701,
              "nil%": 0.898,
            },
            type: {
              "type/Number": {
                min: 0.17088996672584322,
                q1: 2.9786226681458743,
                q3: 7.338187788658235,
                max: 61.69684269960571,
                sd: 3.053663125001991,
                avg: 5.161255547580326,
              },
            },
          },
          base_type: "type/Float",
        }),
        CREATED_AT: createMockColumn({
          description: "The date and time an order was submitted.",
          semantic_type: "type/CreationTimestamp",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          unit: "default",
          name: "CREATED_AT",
          source: "fields",
          field_ref: [
            "field",
            ORDERS.CREATED_AT,
            {
              "temporal-unit": "default",
            },
          ],
          effective_type: "type/DateTime",
          id: ORDERS.CREATED_AT,
          visibility_type: "normal",
          display_name: "Created At",
          fingerprint: {
            global: {
              "distinct-count": 9998,
              "nil%": 0,
            },
            type: {
              "type/DateTime": {
                earliest: "2016-04-30T18:56:13.352Z",
                latest: "2020-04-19T14:07:15.657Z",
              },
            },
          },
          base_type: "type/DateTime",
        }),
        QUANTITY: createMockColumn({
          description: "Number of products bought.",
          semantic_type: "type/Quantity",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "QUANTITY",
          source: "fields",
          field_ref: ["field", ORDERS.QUANTITY, null],
          effective_type: "type/Integer",
          id: ORDERS.QUANTITY,
          visibility_type: "normal",
          display_name: "Quantity",
          fingerprint: {
            global: {
              "distinct-count": 62,
              "nil%": 0,
            },
            type: {
              "type/Number": {
                min: 0,
                q1: 1.755882607764982,
                q3: 4.882654507928044,
                max: 100,
                sd: 4.214258386403798,
                avg: 3.7015,
              },
            },
          },
          base_type: "type/Integer",
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

      it.each([
        [
          "ID",
          [
            {
              type: "drill-thru/zoom",
              objectId: ROW_VALUES.ID,
              manyPks: false,
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
              objectId: ROW_VALUES.USER_ID,
              manyPks: false,
            } as FKDetailsDrillThruInfo,
          ],
        ],

        [
          "SUBTOTAL",
          [
            {
              type: "drill-thru/zoom",
              objectId: ROW_VALUES.ID,
              manyPks: false,
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
              objectId: ROW_VALUES.ID,
              manyPks: false,
            } as ZoomDrillThruInfo,
            {
              type: "drill-thru/quick-filter",
              operators: ["<", ">", "=", "≠"],
            } as QuickFilterDrillThruInfo,
          ],
        ],
      ] as TestCaseConfig<keyof typeof COLUMNS>[])(
        "ORDERS -> %s cell click",
        (clickedColumnName, expectedDrills) => {
          const { query, stageIndex, column, cellValue, row } = setup({
            clickedColumnName,
            columns: COLUMNS,
            rowValues: ROW_VALUES,
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
        },
      );

      it.each([
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
      ] as TestCaseConfig<keyof typeof COLUMNS>[])(
        "ORDERS -> %s header click",
        (clickedColumnName, expectedDrills) => {
          const { query, stageIndex, column } = setup({
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
        },
      );
    });

    describe("aggregated query", () => {
      const COLUMNS = {
        PRODUCT_ID: createMockColumn({
          description:
            "The product ID. This is an internal identifier for the product, NOT the SKU.",
          semantic_type: "type/FK",
          table_id: ORDERS_ID,
          coercion_strategy: null,
          name: "PRODUCT_ID",
          source: "breakout",
          field_ref: [
            "field",
            ORDERS.PRODUCT_ID,
            {
              "base-type": "type/Integer",
            },
          ],
          effective_type: "type/Integer",
          id: ORDERS.PRODUCT_ID,
          visibility_type: "normal",
          display_name: "Product ID",
          fingerprint: {
            global: {
              "distinct-count": 200,
              "nil%": 0,
            },
          },
          base_type: "type/Integer",
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

      it.each([
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
              manyPks: false,
            } as FKDetailsDrillThruInfo,
          ],
        ],
      ] as TestCaseConfig<keyof typeof COLUMNS>[])(
        "ORDERS -> %s cell click",
        (clickedColumnName, expectedDrills) => {
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
        },
      );

      it.each([
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
      ] as TestCaseConfig<keyof typeof COLUMNS>[])(
        "ORDERS -> %s header click",
        (clickedColumnName, expectedDrills) => {
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
        },
      );
    });
  });
});

describe("drillThru", () => {
  it("should apply sort drill", () => {
    const query = createQuery();
    const stageIndex = -1;
    const columns = Lib.orderableColumns(query, stageIndex);
    const column = columnFinder(query, columns)("ORDERS", "SUBTOTAL");

    const drills = availableDrillThrus(
      query,
      stageIndex,
      column,
      undefined,
      undefined,
      undefined,
    );

    const sortDrill = findDrillByType(
      drills,
      "drill-thru/sort",
      query,
      stageIndex,
    );

    const updatedQuery = drillThru(query, stageIndex, sortDrill, "asc");

    expect(Lib.toLegacyQuery(updatedQuery)).toEqual({});
  });
});

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
