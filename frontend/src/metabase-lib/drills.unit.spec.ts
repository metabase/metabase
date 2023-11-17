import {
  createOrdersCreatedAtDatasetColumn,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockCustomColumn } from "metabase-types/api/mocks";
import type { StructuredDatasetQuery } from "metabase-types/api";
import Question from "metabase-lib/Question";
import type { AvailableDrillsTestCase } from "metabase-lib/tests/drills-common";
import {
  AGGREGATED_ORDERS_ROW_VALUES,
  getDrillsQueryParameters,
  ORDERS_ROW_VALUES,
} from "metabase-lib/tests/drills-common";
import { getAvailableDrills, SAMPLE_METADATA } from "./test-helpers";

describe("availableDrillThrus", () => {
  it.each<AvailableDrillsTestCase>([
    {
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "ID",
      expectedDrills: [
        {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
      ],
    },
    {
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedDrills: [
        {
          type: "drill-thru/fk-filter",
        },
        {
          type: "drill-thru/fk-details",
          objectId: ORDERS_ROW_VALUES.USER_ID as string,
          isManyPks: false,
        },
      ],
    },
    {
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "SUBTOTAL",
      expectedDrills: [
        {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
        {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      ],
    },
    {
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedDrills: [
        {
          type: "drill-thru/zoom",
          objectId: ORDERS_ROW_VALUES.ID as string,
          isManyPks: false,
        },
        {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
      ],
    },
    {
      clickType: "header",
      queryType: "unaggregated",
      columnName: "ID",
      expectedDrills: [
        {
          initialOp: expect.objectContaining({ short: "=" }),
          type: "drill-thru/column-filter",
        },
        {
          directions: ["asc", "desc"],
          type: "drill-thru/sort",
        },
        {
          aggregations: ["distinct"],
          type: "drill-thru/summarize-column",
        },
      ],
    },
    {
      clickType: "header",
      queryType: "unaggregated",
      columnName: "PRODUCT_ID",
      expectedDrills: [
        {
          type: "drill-thru/distribution",
        },
        {
          initialOp: expect.objectContaining({ short: "=" }),
          type: "drill-thru/column-filter",
        },
        {
          directions: ["asc", "desc"],
          type: "drill-thru/sort",
        },
        {
          aggregations: ["distinct"],
          type: "drill-thru/summarize-column",
        },
      ],
    },
    {
      clickType: "header",
      queryType: "unaggregated",
      columnName: "SUBTOTAL",
      expectedDrills: [
        { type: "drill-thru/distribution" },
        {
          type: "drill-thru/column-filter",
          initialOp: expect.objectContaining({ short: "=" }),
        },
        {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
        {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct", "sum", "avg"],
        },
        {
          type: "drill-thru/summarize-column-by-time",
        },
      ],
    },
    {
      clickType: "header",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedDrills: [
        { type: "drill-thru/distribution" },
        {
          type: "drill-thru/column-filter",
          initialOp: null,
        },
        {
          type: "drill-thru/sort",
          directions: ["asc", "desc"],
        },
        {
          type: "drill-thru/summarize-column",
          aggregations: ["distinct"],
        },
      ],
    },
    {
      // fk-filter gets returned for non-fk column (metabase#34440), fk-details gets returned for non-fk colum (metabase#34441), underlying-records drill gets shown two times for aggregated query (metabase#34439)
      clickType: "cell",
      queryType: "aggregated",
      columnName: "count",
      expectedDrills: [
        {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
        {
          type: "drill-thru/underlying-records",
          rowCount: 77, // FIXME: (metabase#32108) this should return real count of rows
          tableName: "Orders",
        },
        {
          displayName: "See this month by week",
          type: "drill-thru/zoom-in.timeseries",
        },
      ],
    },
    {
      // fk-filter gets returned for non-fk column (metabase#34440), fk-details gets returned for non-fk colum (metabase#34441), underlying-records drill gets shown two times for aggregated query (metabase#34439)
      clickType: "cell",
      queryType: "aggregated",
      columnName: "max",
      expectedDrills: [
        {
          type: "drill-thru/quick-filter",
          operators: ["=", "≠"],
        },
        {
          type: "drill-thru/underlying-records",
          rowCount: 2, // FIXME: (metabase#32108) this should return real count of rows
          tableName: "Orders",
        },
        {
          type: "drill-thru/zoom-in.timeseries",
          displayName: "See this month by week",
        },
      ],
    },
    {
      // quick-filter gets returned for non-metric column (metabase#34443)
      clickType: "cell",
      queryType: "aggregated",
      columnName: "PRODUCT_ID",
      expectedDrills: [
        {
          type: "drill-thru/fk-filter",
        },
        {
          type: "drill-thru/fk-details",
          objectId: AGGREGATED_ORDERS_ROW_VALUES.PRODUCT_ID as number,
          isManyPks: false,
        },
        {
          rowCount: 3, // FIXME: (metabase#32108) this should return real count of rows
          tableName: "Orders",
          type: "drill-thru/underlying-records",
        },
        {
          displayName: "See this month by week",
          type: "drill-thru/zoom-in.timeseries",
        },
      ],
    },
    {
      // quick-filter gets returned for non-metric column (metabase#34443)
      clickType: "cell",
      queryType: "aggregated",
      columnName: "CREATED_AT",
      expectedDrills: [
        {
          type: "drill-thru/quick-filter",
          operators: ["<", ">", "=", "≠"],
        },
        {
          rowCount: 2, // FIXME: (metabase#32108) this should return real count of rows
          tableName: "Orders",
          type: "drill-thru/underlying-records",
        },
      ],
    },
    {
      clickType: "header",
      queryType: "aggregated",
      columnName: "count",
      expectedDrills: [
        {
          initialOp: expect.objectContaining({ short: "=" }),
          type: "drill-thru/column-filter",
        },
        {
          directions: ["asc", "desc"],
          type: "drill-thru/sort",
        },
      ],
    },
    {
      clickType: "header",
      queryType: "aggregated",
      columnName: "PRODUCT_ID",
      expectedDrills: [
        {
          initialOp: expect.objectContaining({ short: "=" }),
          type: "drill-thru/column-filter",
        },
        {
          directions: ["asc", "desc"],
          type: "drill-thru/sort",
        },
      ],
    },
    {
      clickType: "header",
      queryType: "aggregated",
      columnName: "CREATED_AT",
      expectedDrills: [
        {
          initialOp: null,
          type: "drill-thru/column-filter",
        },
        {
          directions: ["asc", "desc"],
          type: "drill-thru/sort",
        },
      ],
    },
  ])(
    "should return correct drills for $columnName $clickType in $queryType query",
    ({
      columnName,
      clickType,
      queryType,
      expectedDrills,
      queryTable = "ORDERS",
    }) => {
      const { drillsDisplayInfo } = getAvailableDrills({
        clickedColumnName: columnName,
        clickType,
        ...getDrillsQueryParameters(queryType, queryTable),
      });

      expect(drillsDisplayInfo).toEqual(expectedDrills);
    },
  );

  it("should return list of available drills for aggregated query with custom column", () => {
    const question = Question.create({
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
      } as StructuredDatasetQuery,
    });
    const columns = {
      CustomColumn: createMockCustomColumn({
        base_type: "type/Integer",
        name: "CustomColumn",
        display_name: "CustomColumn",
        expression_name: "CustomColumn",
        field_ref: ["expression", "CustomColumn"],
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
      count: createMockCustomColumn({
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

    const { drills } = getAvailableDrills({
      clickedColumnName,
      clickType: "cell",
      question,
      columns,
      rowValues,
    });

    expect(drills).toBeInstanceOf(Array);
  });
});
