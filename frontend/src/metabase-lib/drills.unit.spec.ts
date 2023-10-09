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
  createProductsCategoryDatasetColumn,
  createProductsCreatedAtDatasetColumn,
  createProductsEanDatasetColumn,
  createProductsIdDatasetColumn,
  createProductsPriceDatasetColumn,
  createProductsRatingDatasetColumn,
  createProductsTitleDatasetColumn,
  createProductsVendorDatasetColumn,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockColumn } from "metabase-types/api/mocks";
import type {
  DatasetColumn,
  RowValue,
  StructuredDatasetQuery,
} from "metabase-types/api";
import type { StructuredQuery as StructuredQueryApi } from "metabase-types/api/query";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Question from "metabase-lib/Question";
import { columnFinder, DEFAULT_QUERY, SAMPLE_METADATA } from "./test-helpers";
import { availableDrillThrus, drillThru } from "./drills";

type TestCaseQueryType = "unaggregated" | "aggregated";

type BaseTestCase = {
  clickType: "cell" | "header";
  customQuestion?: Question;
} & (
  | {
      queryTable?: "ORDERS";
      queryType: "unaggregated";
      columnName: keyof typeof ORDERS_COLUMNS;
    }
  | {
      queryTable?: "ORDERS";
      queryType: "aggregated";
      columnName: keyof typeof AGGREGATED_ORDERS_COLUMNS;
    }
  | {
      queryTable: "PRODUCTS";
      queryType: "unaggregated";
      columnName: keyof typeof PRODUCTS_COLUMNS;
    }
  | {
      queryTable: "PRODUCTS";
      queryType: "aggregated";
      columnName: keyof typeof AGGREGATED_PRODUCTS_COLUMNS;
    }
);

type AvailableDrillsTestCase = BaseTestCase & {
  expectedDrills: Lib.DrillThruDisplayInfo[];
};

type DrillDisplayInfoTestCase = BaseTestCase & {
  drillType: Lib.DrillThruType;
  expectedParameters: Lib.DrillThruDisplayInfo;
};

type ApplyDrillTestCase = BaseTestCase & {
  drillType: Lib.DrillThruType;
  drillArgs?: any[];
  expectedQuery: StructuredQueryApi;
};

const ORDERS_DATASET_QUERY = DEFAULT_QUERY as StructuredDatasetQuery;
const ORDERS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: ORDERS_DATASET_QUERY,
});
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
const ORDERS_ROW_VALUES: Record<keyof typeof ORDERS_COLUMNS, RowValue> = {
  ID: "3",
  USER_ID: "1",
  PRODUCT_ID: "105",
  SUBTOTAL: 52.723521442619514,
  TAX: 2.9,
  TOTAL: 49.206842233769756,
  DISCOUNT: null,
  CREATED_AT: "2025-12-06T22:22:48.544+02:00",
  QUANTITY: 2,
};

const AGGREGATED_ORDERS_DATASET_QUERY: StructuredDatasetQuery = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
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
      [
        "max",
        [
          "field",
          ORDERS.DISCOUNT,
          {
            "base-type": "type/Float",
          },
        ],
      ],
    ],
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
          "temporal-unit": "month",
        },
      ],
    ],
  },
};
const AGGREGATED_ORDERS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: AGGREGATED_ORDERS_DATASET_QUERY,
});
const AGGREGATED_ORDERS_COLUMNS = {
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

  sum: createMockColumn({
    base_type: "type/Float",
    name: "sum",
    display_name: "Sum of Tax",
    source: "aggregation",
    field_ref: ["aggregation", 1],
    effective_type: "type/Float",
  }),

  max: createMockColumn({
    base_type: "type/Float",
    name: "max",
    display_name: "Max of Discount",
    source: "aggregation",
    field_ref: ["aggregation", 2],
    effective_type: "type/Float",
  }),
};
const AGGREGATED_ORDERS_ROW_VALUES: Record<
  keyof typeof AGGREGATED_ORDERS_COLUMNS,
  RowValue
> = {
  PRODUCT_ID: 3,
  CREATED_AT: "2022-12-01T00:00:00+02:00",
  count: 77,
  sum: 1,
  max: null,
};

const PRODUCTS_DATASET_QUERY: StructuredDatasetQuery = {
  database: SAMPLE_DB_ID,
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
  },
};
const PRODUCTS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: PRODUCTS_DATASET_QUERY,
});
const PRODUCTS_COLUMNS = {
  ID: createProductsIdDatasetColumn(),
  EAN: createProductsEanDatasetColumn(),
  TITLE: createProductsTitleDatasetColumn(),
  CATEGORY: createProductsCategoryDatasetColumn(),
  VENDOR: createProductsVendorDatasetColumn(),
  PRICE: createProductsPriceDatasetColumn(),
  RATING: createProductsRatingDatasetColumn(),
  CREATED_AT: createProductsCreatedAtDatasetColumn(),
};
const PRODUCTS_ROW_VALUES: Record<keyof typeof PRODUCTS_COLUMNS, RowValue> = {
  ID: "3",
  EAN: "4966277046676",
  TITLE: "Synergistic Granite Chair",
  CATEGORY: "Doohickey",
  VENDOR: "Murray, Watsica and Wunsch",
  PRICE: 35.38,
  RATING: 4,
  CREATED_AT: "2024-09-08T22:03:20.239+03:00",
};

const AGGREGATED_PRODUCTS_DATASET_QUERY: StructuredDatasetQuery = {
  type: "query",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CATEGORY,
        {
          "base-type": "type/Text",
        },
      ],
    ],
  },
};
const AGGREGATED_PRODUCTS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: AGGREGATED_PRODUCTS_DATASET_QUERY,
});
const AGGREGATED_PRODUCTS_COLUMNS = {
  CATEGORY: createProductsCategoryDatasetColumn({
    source: "breakout",
    field_ref: [
      "field",
      PRODUCTS.CATEGORY,
      {
        "base-type": "type/Text",
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
const AGGREGATED_PRODUCTS_ROW_VALUES: Record<
  keyof typeof AGGREGATED_PRODUCTS_COLUMNS,
  RowValue
> = {
  CATEGORY: "Doohickey",
  count: 42,
};

const STAGE_INDEX = -1;

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
          "manyPks?": false,
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
          "manyPks?": false,
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
          "manyPks?": false,
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
          "manyPks?": false,
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
    // FIXME: fk-filter gets returned for non-fk column (metabase#34440), fk-details gets returned for non-fk colum (metabase#34441), underlying-records drill gets shown two times for aggregated query (metabase#34439)
    // {
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "count",
    //   expectedDrills: [
    //     {
    //       type: "drill-thru/quick-filter",
    //       operators: ["<", ">", "=", "≠"],
    //     },
    //     {
    //       type: "drill-thru/underlying-records",
    //       rowCount: 2, // FIXME: (metabase#32108) this should return real count of rows
    //       tableName: "Orders",
    //     },
    //     {
    //       displayName: "See this month by week",
    //       type: "drill-thru/zoom-in.timeseries",
    //     },
    //   ],
    // },
    // FIXME: fk-filter gets returned for non-fk column (metabase#34440), fk-details gets returned for non-fk colum (metabase#34441), underlying-records drill gets shown two times for aggregated query (metabase#34439)
    // {
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "max",
    //   expectedDrills: [
    //     {
    //       type: "drill-thru/quick-filter",
    //       operators: ["=", "≠"],
    //     },
    //     {
    //       type: "drill-thru/underlying-records",
    //       rowCount: 2, // FIXME: (metabase#32108) this should return real count of rows
    //       tableName: "Orders",
    //     },
    //
    //     {
    //       type: "drill-thru/zoom-in.timeseries",
    //       displayName: "See this month by week",
    //     },
    //   ],
    // },
    // FIXME: quick-filter gets returned for non-metric column (metabase#34443)
    // {
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "PRODUCT_ID",
    //   expectedDrills: [
    //     {
    //       type: "drill-thru/fk-filter",
    //     },
    //     {
    //       type: "drill-thru/fk-details",
    //       objectId: AGGREGATED_ORDERS_ROW_VALUES.PRODUCT_ID as number,
    //       "manyPks?": false,
    //     },
    //     {
    //       rowCount: 2, // FIXME: (metabase#32108) this should return real count of rows
    //       tableName: "Orders",
    //       type: "drill-thru/underlying-records",
    //     },
    //   ],
    // },
    // FIXME: quick-filter gets returned for non-metric column (metabase#34443)
    // {
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "CREATED_AT",
    //   expectedDrills: [
    //     {
    //       type: "drill-thru/quick-filter",
    //       operators: ["<", ">", "=", "≠"],
    //     },
    //     {
    //       rowCount: 3, // FIXME: (metabase#32108) this should return real count of rows
    //       tableName: "Orders",
    //       type: "drill-thru/underlying-records",
    //     },
    //   ],
    // },

    // FIXME for some reason the results for aggregated query are not correct (metabase#34223, metabase#34341)
    // We expect column-filter and sort drills, but get distribution and summarize-column
    // {
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "count",
    //   expectedDrills: [
    //     {
    //       initialOp: expect.objectContaining({ short: "=" }),
    //       type: "drill-thru/column-filter",
    //     },
    //     {
    //       directions: ["asc", "desc"],
    //       type: "drill-thru/sort",
    //     },
    //   ],
    // },
    // FIXME for some reason the results for aggregated query are not correct (metabase#34223, metabase#34341)
    // We expect column-filter and sort drills, but get distribution and summarize-column
    // {
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "PRODUCT_ID",
    //   expectedDrills: [
    //     {
    //       initialOp: expect.objectContaining({ short: "=" }),
    //       type: "drill-thru/column-filter",
    //     },
    //     {
    //       directions: ["asc", "desc"],
    //       type: "drill-thru/sort",
    //     },
    //   ],
    // },
    // FIXME for some reason the results for aggregated query are not correct (metabase#34223, metabase#34341)
    // We expect column-filter and sort drills, but get distribution and summarize-column
    // {
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "CREATED_AT",
    //   expectedDrills: [
    //     {
    //       initialOp: expect.objectContaining({ short: "=" }),
    //       type: "drill-thru/column-filter",
    //     },
    //     {
    //       directions: ["asc", "desc"],
    //       type: "drill-thru/sort",
    //     },
    //   ],
    // },
  ])(
    "should return correct drills for $columnName $clickType in $queryType query",
    ({
      columnName,
      clickType,
      queryType,
      expectedDrills,
      queryTable = "ORDERS",
    }) => {
      const { drillsDisplayInfo } =
        queryTable === "PRODUCTS"
          ? setupAvailableDrillsWithProductsQuery({
              clickType,
              queryType,
              columnName,
            })
          : setupAvailableDrillsWithOrdersQuery({
              clickType,
              queryType,
              columnName,
            });

      expect(drillsDisplayInfo).toEqual(expectedDrills);
    },
  );

  it.each<DrillDisplayInfoTestCase>([
    // region --- drill-thru/sort
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "ID",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "TOTAL",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "TOTAL",
      customQuestion: Question.create({
        metadata: SAMPLE_METADATA,
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "order-by": [["desc", ["field", ORDERS.TOTAL, null]]],
            "source-table": ORDERS_ID,
          },
        },
      }),
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      customQuestion: Question.create({
        metadata: SAMPLE_METADATA,
        dataset_query: {
          ...AGGREGATED_ORDERS_DATASET_QUERY,
          query: {
            ...AGGREGATED_ORDERS_DATASET_QUERY.query,
            "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
          },
        },
      }),
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "aggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "aggregated",
      columnName: "PRODUCT_ID",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "aggregated",
      columnName: "count",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "aggregated",
      columnName: "count",
      customQuestion: Question.create({
        metadata: SAMPLE_METADATA,
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
            "source-table": ORDERS_ID,
          },
        },
      }),
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "aggregated",
      columnName: "max",
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["asc", "desc"],
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      queryType: "aggregated",
      columnName: "CREATED_AT",
      customQuestion: Question.create({
        metadata: SAMPLE_METADATA,
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
            "source-table": ORDERS_ID,
          },
        },
      }),
      expectedParameters: {
        type: "drill-thru/sort",
        directions: ["desc"],
      },
    },
    // endregion

    // region --- drill-thru/column-filter
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "ID",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "TAX",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "DISCOUNT",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: null,
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "QUANTITY",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "aggregated",
      columnName: "PRODUCT_ID",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "aggregated",
      columnName: "PRODUCT_ID",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: expect.objectContaining({ short: "=" }),
      },
    },
    {
      drillType: "drill-thru/column-filter",
      clickType: "header",
      queryType: "aggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/column-filter",
        initialOp: null,
      },
    },
    // FIXME "column-filter" should be available for aggregated query metric column (metabase#34223)
    // {
    //   drillType: "drill-thru/column-filter",
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "count",
    //   expectedParameters: {
    //     type: "drill-thru/column-filter",
    //     initialOp: expect.objectContaining({ short: "=" }),
    //   },
    // },
    // FIXME "column-filter" should be available for aggregated query metric column (metabase#34223)
    // {
    //   drillType: "drill-thru/column-filter",
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "max",
    //   expectedParameters: {
    //     type: "drill-thru/column-filter",
    //     initialOp: expect.objectContaining({ short: "=" }),
    //   },
    // },
    // endregion

    // region --- drill-thru/summarize-column
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "ID",
      expectedParameters: {
        type: "drill-thru/summarize-column",
        aggregations: ["distinct"],
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedParameters: {
        type: "drill-thru/summarize-column",
        aggregations: ["distinct"],
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "SUBTOTAL",
      expectedParameters: {
        type: "drill-thru/summarize-column",
        aggregations: ["distinct", "sum", "avg"],
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/summarize-column",
        aggregations: ["distinct"],
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "QUANTITY",
      expectedParameters: {
        type: "drill-thru/summarize-column",
        aggregations: ["distinct", "sum", "avg"],
      },
    },
    // endregion

    // region --- drill-thru/distribution
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedParameters: {
        type: "drill-thru/distribution",
      },
    },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "TAX",
      expectedParameters: {
        type: "drill-thru/distribution",
      },
    },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "QUANTITY",
      expectedParameters: {
        type: "drill-thru/distribution",
      },
    },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      queryType: "aggregated",
      columnName: "PRODUCT_ID",
      expectedParameters: {
        type: "drill-thru/distribution",
      },
    },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      queryType: "aggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/distribution",
      },
    },
    // endregion

    // region --- drill-thru/fk-filter
    {
      drillType: "drill-thru/fk-filter",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedParameters: {
        type: "drill-thru/fk-filter",
      },
    },
    {
      drillType: "drill-thru/fk-filter",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "PRODUCT_ID",
      expectedParameters: {
        type: "drill-thru/fk-filter",
      },
    },
    // FIXME: `fk-filter` doesn't get returned for fk column that was used as breakout (metabase#34440)
    // {
    //   drillType: "drill-thru/fk-filter",
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "PRODUCT_ID",
    //   expectedParameters: {
    //     type: "drill-thru/fk-filter",
    //   },
    // },
    // endregion

    // region --- drill-thru/quick-filter
    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "SUBTOTAL",
      expectedParameters: {
        type: "drill-thru/quick-filter",
        operators: ["<", ">", "=", "≠"],
      },
    },
    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "DISCOUNT",
      expectedParameters: {
        type: "drill-thru/quick-filter",
        operators: ["=", "≠"],
      },
    },
    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/quick-filter",
        operators: ["<", ">", "=", "≠"],
      },
    },
    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "QUANTITY",
      expectedParameters: {
        type: "drill-thru/quick-filter",
        operators: ["<", ">", "=", "≠"],
      },
    },
    // FIXME: quick-filter doesn't get returned for CREATED_AT column in aggregated query (metabase#34443)
    // {
    //   drillType: "drill-thru/quick-filter",
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "CREATED_AT",
    //   expectedParameters: {
    //     type: "drill-thru/quick-filter",
    //     operators: ["<", ">", "=", "≠"],
    //   },
    // },
    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      queryType: "aggregated",
      columnName: "count",
      expectedParameters: {
        type: "drill-thru/quick-filter",
        operators: ["<", ">", "=", "≠"],
      },
    },
    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      queryType: "aggregated",
      columnName: "sum",
      expectedParameters: {
        type: "drill-thru/quick-filter",
        operators: ["<", ">", "=", "≠"],
      },
    },
    // FIXME: quick-filter returns extra "<", ">" operators for cell with no value (metabase#34445)
    // {
    //   drillType: "drill-thru/quick-filter",
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   columnName: "max",
    //   expectedParameters: {
    //     type: "drill-thru/quick-filter",
    //     operators: ["=", "≠"],
    //   },
    // },
    // endregion

    // region --- drill-thru/underlying-records
    {
      drillType: "drill-thru/underlying-records",
      clickType: "cell",
      queryType: "aggregated",
      columnName: "count",
      expectedParameters: {
        type: "drill-thru/underlying-records",
        rowCount: 3, // FIXME: (metabase#32108) this should return real count of rows
        tableName: "Orders",
      },
    },
    {
      drillType: "drill-thru/underlying-records",
      clickType: "cell",
      queryType: "aggregated",
      columnName: "sum",
      expectedParameters: {
        type: "drill-thru/underlying-records",
        rowCount: 3, // FIXME: (metabase#32108) this should return real count of rows
        tableName: "Orders",
      },
    },
    {
      drillType: "drill-thru/underlying-records",
      clickType: "cell",
      queryType: "aggregated",
      columnName: "max",
      expectedParameters: {
        type: "drill-thru/underlying-records",
        rowCount: 3, // FIXME: (metabase#32108) this should return real count of rows
        tableName: "Orders",
      },
    },
    // endregion

    // region --- drill-thru/summarize-column-by-time
    {
      drillType: "drill-thru/summarize-column-by-time",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "SUBTOTAL",
      expectedParameters: {
        type: "drill-thru/summarize-column-by-time",
      },
    },
    {
      drillType: "drill-thru/summarize-column-by-time",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "DISCOUNT",
      expectedParameters: {
        type: "drill-thru/summarize-column-by-time",
      },
    },
    {
      drillType: "drill-thru/summarize-column-by-time",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "QUANTITY",
      expectedParameters: {
        type: "drill-thru/summarize-column-by-time",
      },
    },
    // endregion

    // region --- drill-thru/zoom-in.timeseries
    // FIXME: "zoom-in.timeseries" should be returned for aggregated query metric click (metabase#33811)
    // {
    //   drillType: "drill-thru/zoom-in.timeseries",
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "count",
    //   expectedParameters: {
    //     type: "drill-thru/zoom-in.timeseries",
    //   },
    // },
    // {
    //   drillType: "drill-thru/zoom-in.timeseries",
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "max",
    //   expectedParameters: {
    //     type: "drill-thru/zoom-in.timeseries",
    //   },
    // },
    // {
    //   drillType: "drill-thru/zoom-in.timeseries",
    //   clickType: "header",
    //   queryType: "aggregated",
    //   columnName: "sum",
    //   expectedParameters: {
    //     type: "drill-thru/zoom-in.timeseries",
    //   },
    // },
    // endregion

    // region --- drill-thru/zoom
    {
      drillType: "drill-thru/zoom",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "ID",
      expectedParameters: {
        type: "drill-thru/zoom",
        objectId: ORDERS_ROW_VALUES.ID as string,
        "manyPks?": false,
      },
    },
    {
      drillType: "drill-thru/zoom",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "TAX",
      expectedParameters: {
        type: "drill-thru/zoom",
        objectId: ORDERS_ROW_VALUES.ID as string,
        "manyPks?": false,
      },
    },
    {
      drillType: "drill-thru/zoom",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "DISCOUNT",
      expectedParameters: {
        type: "drill-thru/zoom",
        objectId: ORDERS_ROW_VALUES.ID as string,
        "manyPks?": false,
      },
    },
    {
      drillType: "drill-thru/zoom",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "CREATED_AT",
      expectedParameters: {
        type: "drill-thru/zoom",
        objectId: ORDERS_ROW_VALUES.ID as string,
        "manyPks?": false,
      },
    },
    {
      drillType: "drill-thru/zoom",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "QUANTITY",
      expectedParameters: {
        type: "drill-thru/zoom",
        objectId: ORDERS_ROW_VALUES.ID as string,
        "manyPks?": false,
      },
    },
    // endregion

    // region --- drill-thru/pk
    // FIXME: how to trigger this ???
    // endregion

    // region --- drill-thru/fk-details
    {
      drillType: "drill-thru/fk-details",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "PRODUCT_ID",
      expectedParameters: {
        type: "drill-thru/fk-details",
        objectId: ORDERS_ROW_VALUES.PRODUCT_ID as string,
        "manyPks?": false,
      },
    },
    {
      drillType: "drill-thru/fk-details",
      clickType: "cell",
      queryType: "unaggregated",
      columnName: "USER_ID",
      expectedParameters: {
        type: "drill-thru/fk-details",
        objectId: ORDERS_ROW_VALUES.USER_ID as string,
        "manyPks?": false,
      },
    },
    // endregion

    // region --- drill-thru/pivot
    // FIXME: pivot is not implemented yet (metabase#33559)
    // {
    //   drillType: "drill-thru/pivot",
    //   clickType: "cell",
    //   queryType: "aggregated",
    //   queryTable: "PRODUCTS",
    //   columnName: "count",
    //   expectedParameters: {
    //     type: "drill-thru/pivot",
    //   },
    // },
    // endregion
  ])(
    'should return "$drillType" drill config for $columnName $clickType in $queryType query',
    ({
      drillType,
      columnName,
      clickType,
      queryType,
      queryTable = "ORDERS",
      customQuestion,
      expectedParameters,
    }) => {
      const { drillDisplayInfo } =
        queryTable === "PRODUCTS"
          ? setupDrillDisplayInfoWithProductsQuery({
              drillType,
              clickType,
              queryType,
              columnName,
              customQuestion,
            })
          : setupDrillDisplayInfoWithOrdersQuery({
              drillType,
              clickType,
              queryType,
              columnName,
              customQuestion,
            });

      expect(drillDisplayInfo).toEqual(expectedParameters);
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
      CustomColumn: createMockColumn({
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
      tableName: "ORDERS",
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

describe("drillThru", () => {
  it.each<ApplyDrillTestCase>([
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "ID",
      queryType: "unaggregated",
      drillArgs: ["asc"],
      expectedQuery: {
        "order-by": [
          [
            "asc",
            [
              "field",
              ORDERS.ID,
              {
                "base-type": "type/BigInteger",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "PRODUCT_ID",
      queryType: "unaggregated",
      drillArgs: ["desc"],
      expectedQuery: {
        "order-by": [
          [
            "desc",
            [
              "field",
              ORDERS.PRODUCT_ID,
              {
                "base-type": "type/Integer",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "SUBTOTAL",
      queryType: "unaggregated",
      drillArgs: ["asc"],
      expectedQuery: {
        "order-by": [
          [
            "asc",
            [
              "field",
              ORDERS.SUBTOTAL,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "DISCOUNT",
      queryType: "unaggregated",
      drillArgs: ["desc"],
      expectedQuery: {
        "order-by": [
          [
            "desc",
            [
              "field",
              ORDERS.DISCOUNT,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "CREATED_AT",
      queryType: "unaggregated",
      drillArgs: ["asc"],
      expectedQuery: {
        "order-by": [
          [
            "asc",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "PRODUCT_ID",
      queryType: "aggregated",
      drillArgs: ["desc"],
      expectedQuery: {
        ...AGGREGATED_ORDERS_DATASET_QUERY.query,
        "order-by": [
          [
            "desc",
            [
              "field",
              ORDERS.PRODUCT_ID,
              {
                "base-type": "type/Integer",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "CREATED_AT",
      queryType: "aggregated",
      drillArgs: ["asc"],
      expectedQuery: {
        ...AGGREGATED_ORDERS_DATASET_QUERY.query,
        "order-by": [
          [
            "asc",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "month",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/sort",
      clickType: "header",
      columnName: "sum",
      queryType: "aggregated",
      drillArgs: ["asc"],
      expectedQuery: {
        ...AGGREGATED_ORDERS_DATASET_QUERY.query,
        "order-by": [["asc", ["aggregation", 1]]],
        "source-table": ORDERS_ID,
      },
    },

    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      queryType: "unaggregated",
      columnName: "ID",
      drillArgs: ["distinct"],
      expectedQuery: {
        aggregation: [
          [
            "distinct",
            [
              "field",
              ORDERS.ID,
              {
                "base-type": "type/BigInteger",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      columnName: "PRODUCT_ID",
      queryType: "unaggregated",
      drillArgs: ["distinct"],
      expectedQuery: {
        aggregation: [
          [
            "distinct",
            [
              "field",
              ORDERS.PRODUCT_ID,
              {
                "base-type": "type/Integer",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      columnName: "SUBTOTAL",
      queryType: "unaggregated",
      drillArgs: ["distinct"],
      expectedQuery: {
        aggregation: [
          [
            "distinct",
            [
              "field",
              ORDERS.SUBTOTAL,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      columnName: "TAX",
      queryType: "unaggregated",
      drillArgs: ["sum"],
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
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      columnName: "DISCOUNT",
      queryType: "unaggregated",
      drillArgs: ["avg"],
      expectedQuery: {
        aggregation: [
          [
            "avg",
            [
              "field",
              ORDERS.DISCOUNT,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      columnName: "CREATED_AT",
      queryType: "unaggregated",
      drillArgs: ["distinct"],
      expectedQuery: {
        aggregation: [
          [
            "distinct",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },
    {
      drillType: "drill-thru/summarize-column",
      clickType: "header",
      columnName: "QUANTITY",
      queryType: "unaggregated",
      drillArgs: ["avg"],
      expectedQuery: {
        aggregation: [
          [
            "avg",
            [
              "field",
              ORDERS.QUANTITY,
              {
                "base-type": "type/Integer",
              },
            ],
          ],
        ],
        "source-table": ORDERS_ID,
      },
    },

    // FIXME: distribution drill result for FK columns creates extra binning, which is wrong (metabase#34343)
    // {
    //   drillType: "drill-thru/distribution",
    //   clickType: "header",
    //   columnName: "USER_ID",
    //   queryType: "unaggregated",
    //   expectedQuery: {
    //     aggregation: [["count"]],
    //     breakout: [["field", ORDERS.USER_ID, null]],
    //     "source-table": ORDERS_ID,
    //   },
    // },
    {
      drillType: "drill-thru/distribution",
      clickType: "header",
      columnName: "SUBTOTAL",
      queryType: "unaggregated",
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
      columnName: "CREATED_AT",
      queryType: "unaggregated",
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
      columnName: "TAX",
      queryType: "unaggregated",
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
      columnName: "QUANTITY",
      queryType: "unaggregated",
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

    {
      drillType: "drill-thru/quick-filter",
      clickType: "cell",
      columnName: "SUBTOTAL",
      queryType: "unaggregated",
      drillArgs: ["="],
      expectedQuery: {
        filter: [
          "=",
          [
            "field",
            ORDERS.SUBTOTAL,
            {
              "base-type": "type/Float",
            },
          ],
          ORDERS_ROW_VALUES.SUBTOTAL,
        ],
        "source-table": ORDERS_ID,
      },
    },

    {
      drillType: "drill-thru/fk-filter",
      clickType: "cell",
      columnName: "USER_ID",
      queryType: "unaggregated",
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
      columnName: "PRODUCT_ID",
      queryType: "unaggregated",
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

    // FIXME: filter gets applied on the the same query stage as aggregations, but it should wrap the query (metabase#34346)
    // {
    //   drillType: "drill-thru/quick-filter",
    //   clickType: "cell",
    //   columnName: "sum",
    //   queryType: "aggregated",
    //   drillArgs: ["="],
    //   expectedQuery: {
    //     "source-query": AGGREGATED_ORDERS_DATASET_QUERY.query,
    //     filter: [
    //       "=",
    //       [
    //         "field",
    //         "sum",
    //         {
    //           "base-type": "type/Float",
    //         },
    //       ],
    //       AGGREGATED_ORDERS_ROW_VALUES.sum,
    //     ],
    //   },
    // },
    // {
    //   drillType: "drill-thru/quick-filter",
    //   clickType: "cell",
    //   columnName: "CREATED_AT",
    //   queryType: "aggregated",
    //   drillArgs: ["<"],
    //   expectedQuery: {
    //     ...AGGREGATED_ORDERS_DATASET_QUERY.query,
    //     filter: [
    //       "<",
    //       [
    //         "field",
    //         ORDERS.CREATED_AT,
    //         {
    //           "base-type": "type/DateTime",
    //           "temporal-unit": "month",
    //         },
    //       ],
    //       AGGREGATED_ORDERS_ROW_VALUES.CREATED_AT,
    //     ] as ComparisonFilter,
    //   },
    // },
    // {
    //   drillType: "drill-thru/quick-filter",
    //   clickType: "cell",
    //   columnName: "max",
    //   queryType: "aggregated",
    //   drillArgs: ["≠"],
    //   expectedQuery: {
    //     "source-query": AGGREGATED_ORDERS_DATASET_QUERY.query,
    //     filter: [
    //       "not-null",
    //       [
    //         "field",
    //         "max",
    //         {
    //           "base-type": "type/Float",
    //         },
    //       ],
    //     ],
    //   },
    // },

    // FIXME: fk-details doesn't create a query for fk target table (metabase#34383)
    // {
    //   drillType: "drill-thru/fk-details",
    //   clickType: "cell",
    //   columnName: "PRODUCT_ID",
    //   queryType: "unaggregated",
    //   expectedQuery: {
    //     filter: [
    //       "=",
    //       ["field", PRODUCTS.ID, null],
    //       ORDERS_ROW_VALUES.PRODUCT_ID,
    //     ],
    //     "source-table": PRODUCTS_ID,
    //   },
    // },
    // {
    //   drillType: "drill-thru/fk-details",
    //   clickType: "cell",
    //   columnName: "USER_ID",
    //   queryType: "unaggregated",
    //   expectedQuery: {
    //     filter: ["=", ["field", PEOPLE.ID, null], ORDERS_ROW_VALUES.USER_ID],
    //     "source-table": PEOPLE_ID,
    //   },
    // },
  ])(
    'should return correct result on "$drillType" drill apply to $columnName on $clickType in $queryType query',
    ({
      drillType,
      columnName,
      clickType,
      queryType,
      queryTable,
      customQuestion,
      drillArgs = [],
      expectedQuery,
    }) => {
      const { drill, stageIndex, query } =
        queryTable === "PRODUCTS"
          ? setupDrillDisplayInfoWithProductsQuery({
              drillType,
              clickType,
              queryType,
              columnName,
              customQuestion,
            })
          : setupDrillDisplayInfoWithOrdersQuery({
              drillType,
              clickType,
              queryType,
              columnName,
              customQuestion,
            });

      const updatedQuery = drillThru(query, stageIndex, drill, ...drillArgs);

      expect(Lib.toLegacyQuery(updatedQuery)).toEqual({
        database: SAMPLE_DB_ID,
        query: expectedQuery,
        type: "query",
      });
    },
  );
});

const getMetadataColumns = (query: Lib.Query): Lib.ColumnMetadata[] => {
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const breakouts = Lib.breakouts(query, STAGE_INDEX);

  return aggregations.length === 0 && breakouts.length === 0
    ? Lib.visibleColumns(query, STAGE_INDEX)
    : [
        ...Lib.breakoutableColumns(query, STAGE_INDEX),
        ...Lib.orderableColumns(query, STAGE_INDEX),
      ];
};

function setup({
  question = ORDERS_QUESTION,
  clickedColumnName,
  columns,
  rowValues,
  tableName,
}: {
  question?: Question;
  clickedColumnName: string;
  columns: Record<string, DatasetColumn>;
  rowValues: Record<string, RowValue>;
  tableName: string;
}) {
  const query = question._getMLv2Query();
  const legacyQuery = question.query() as StructuredQuery;

  const stageIndex = -1;

  const legacyColumns = legacyQuery.columns();

  const metadataColumns = getMetadataColumns(query);
  const column = columnFinder(query, metadataColumns)(
    tableName,
    clickedColumnName,
  );

  return {
    query,
    stageIndex,
    column,
    cellValue: rowValues[clickedColumnName],
    row: legacyColumns.map(({ name }) => ({
      col: columns[name],
      value: rowValues[name],
    })),
  };
}

function setupAvailableDrillsWithOrdersQuery({
  clickType,
  queryType,
  columnName,
  customQuestion,
}: {
  clickType: "cell" | "header";
  queryType: TestCaseQueryType;
  columnName: string;
  customQuestion?: Question;
  debug?: boolean;
}) {
  const { query, stageIndex, column, cellValue, row } = setup(
    queryType === "unaggregated"
      ? {
          question: customQuestion || ORDERS_QUESTION,
          clickedColumnName: columnName,
          columns: ORDERS_COLUMNS,
          rowValues: ORDERS_ROW_VALUES,
          tableName: "ORDERS",
        }
      : {
          question: customQuestion || AGGREGATED_ORDERS_QUESTION,
          clickedColumnName: columnName,
          columns: AGGREGATED_ORDERS_COLUMNS,
          rowValues: AGGREGATED_ORDERS_ROW_VALUES,
          tableName: "ORDERS",
        },
  );

  return {
    ...setupDrillDisplayInfo({
      clickType,
      queryType,
      columnName,
      query,
      stageIndex,
      column,
      cellValue,
      row,
    }),
    query,
    stageIndex,
  };
}

function setupDrillDisplayInfoWithOrdersQuery({
  drillType,
  clickType,
  queryType,
  columnName,
  customQuestion,
}: {
  drillType: Lib.DrillThruType;
  clickType: "cell" | "header";
  queryType: TestCaseQueryType;
  columnName: string;
  customQuestion?: Question;
}) {
  const { drills, drillsDisplayInfo, query, stageIndex } =
    setupAvailableDrillsWithOrdersQuery({
      clickType,
      queryType,
      columnName,
      customQuestion,
    });

  const drillIndex = drillsDisplayInfo.findIndex(
    ({ type }) => type === drillType,
  );
  const drill = drills[drillIndex];
  const drillDisplayInfo = drillsDisplayInfo[drillIndex];

  if (!drill) {
    throw new TypeError(`Failed to find ${drillType} drill`);
  }

  return {
    drill,
    drillDisplayInfo,
    query,
    stageIndex,
  };
}

function setupAvailableDrillsWithProductsQuery({
  clickType,
  queryType,
  columnName,
  customQuestion,
}: {
  clickType: "cell" | "header";
  queryType: TestCaseQueryType;
  columnName: string;
  customQuestion?: Question;
  debug?: boolean;
}) {
  const { query, stageIndex, column, cellValue, row } = setup(
    queryType === "unaggregated"
      ? {
          question: customQuestion || PRODUCTS_QUESTION,
          clickedColumnName: columnName,
          columns: PRODUCTS_COLUMNS,
          rowValues: PRODUCTS_ROW_VALUES,
          tableName: "PRODUCTS",
        }
      : {
          question: customQuestion || AGGREGATED_PRODUCTS_QUESTION,
          clickedColumnName: columnName,
          columns: AGGREGATED_PRODUCTS_COLUMNS,
          rowValues: AGGREGATED_PRODUCTS_ROW_VALUES,
          tableName: "PRODUCTS",
        },
  );

  return {
    ...setupDrillDisplayInfo({
      clickType,
      queryType,
      columnName,
      query,
      stageIndex,
      column,
      cellValue,
      row,
    }),
    query,
    stageIndex,
  };
}

function setupDrillDisplayInfoWithProductsQuery({
  drillType,
  clickType,
  queryType,
  columnName,
  customQuestion,
}: {
  drillType: Lib.DrillThruType;
  clickType: "cell" | "header";
  queryType: TestCaseQueryType;
  columnName: string;
  customQuestion?: Question;
  debug?: boolean;
}) {
  const { drills, drillsDisplayInfo, query, stageIndex } =
    setupAvailableDrillsWithProductsQuery({
      clickType,
      queryType,
      columnName,
      customQuestion,
    });

  const drillIndex = drillsDisplayInfo.findIndex(
    ({ type }) => type === drillType,
  );
  const drill = drills[drillIndex];
  const drillDisplayInfo = drillsDisplayInfo[drillIndex];

  if (!drill) {
    throw new TypeError(`Failed to find ${drillType} drill`);
  }

  return {
    drill,
    drillDisplayInfo,
    query,
    stageIndex,
  };
}

function setupDrillDisplayInfo({
  clickType,
  queryType,
  columnName,
  query,
  stageIndex,
  column,
  cellValue,
  row,
}: {
  clickType: "cell" | "header";
  queryType: TestCaseQueryType;
  columnName: string;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  cellValue: RowValue;
  row: {
    col: DatasetColumn;
    value: RowValue;
  }[];
}) {
  const dimensions =
    queryType === "aggregated"
      ? row
          .filter(
            ({ col }) => col?.source === "breakout" && col?.name !== columnName,
          )
          .map(({ value, col }) => ({ value, column: col }))
      : undefined;

  const drills =
    clickType === "cell"
      ? availableDrillThrus(
          query,
          stageIndex,
          column,
          cellValue,
          row,
          dimensions,
        )
      : availableDrillThrus(
          query,
          stageIndex,
          column,
          undefined,
          undefined,
          undefined,
        );

  const drillsDisplayInfo = drills.map(drill =>
    Lib.displayInfo(query, stageIndex, drill),
  );

  return {
    drills,
    drillsDisplayInfo,
  };
}
