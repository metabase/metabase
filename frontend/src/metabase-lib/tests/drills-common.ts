/* istanbul ignore file */
import type {
  RowValue,
  StructuredDatasetQuery,
  StructuredQuery as StructuredQueryApi,
} from "metabase-types/api";
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
import type * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import { DEFAULT_QUERY, SAMPLE_METADATA } from "metabase-lib/test-helpers";

export type BaseTestCase = {
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
export type AvailableDrillsTestCase = BaseTestCase & {
  expectedDrills: Lib.DrillThruDisplayInfo[];
};
export type DrillDisplayInfoTestCase = BaseTestCase & {
  expectedParameters: Lib.DrillThruDisplayInfo;
};
export type ApplyDrillTestCase = BaseTestCase & {
  drillArgs?: any[];
  expectedQuery: StructuredQueryApi;
};

export const ORDERS_DATASET_QUERY = DEFAULT_QUERY as StructuredDatasetQuery;
export const ORDERS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: ORDERS_DATASET_QUERY,
});
export const ORDERS_COLUMNS = {
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
export const ORDERS_COLUMNS_LIST = Object.values(ORDERS_COLUMNS);
export const ORDERS_ROW_VALUES: Record<keyof typeof ORDERS_COLUMNS, RowValue> =
  {
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

export const AGGREGATED_ORDERS_DATASET_QUERY: StructuredDatasetQuery = {
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
export const AGGREGATED_ORDERS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: AGGREGATED_ORDERS_DATASET_QUERY,
});
export const AGGREGATED_ORDERS_COLUMNS = {
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
    unit: "month",
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
export const AGGREGATED_ORDERS_ROW_VALUES: Record<
  keyof typeof AGGREGATED_ORDERS_COLUMNS,
  RowValue
> = {
  PRODUCT_ID: 3,
  CREATED_AT: "2022-12-01T00:00:00+02:00",
  count: 77,
  sum: 1,
  max: null,
};

export const PRODUCTS_DATASET_QUERY: StructuredDatasetQuery = {
  database: SAMPLE_DB_ID,
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
  },
};
export const PRODUCTS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: PRODUCTS_DATASET_QUERY,
});
export const PRODUCTS_COLUMNS = {
  ID: createProductsIdDatasetColumn(),
  EAN: createProductsEanDatasetColumn(),
  TITLE: createProductsTitleDatasetColumn(),
  CATEGORY: createProductsCategoryDatasetColumn(),
  VENDOR: createProductsVendorDatasetColumn(),
  PRICE: createProductsPriceDatasetColumn(),
  RATING: createProductsRatingDatasetColumn(),
  CREATED_AT: createProductsCreatedAtDatasetColumn(),
};
export const PRODUCTS_ROW_VALUES: Record<
  keyof typeof PRODUCTS_COLUMNS,
  RowValue
> = {
  ID: "3",
  EAN: "4966277046676",
  TITLE: "Synergistic Granite Chair",
  CATEGORY: "Doohickey",
  VENDOR: "Murray, Watsica and Wunsch",
  PRICE: 35.38,
  RATING: 4,
  CREATED_AT: "2024-09-08T22:03:20.239+03:00",
};

export const AGGREGATED_PRODUCTS_DATASET_QUERY: StructuredDatasetQuery = {
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
export const AGGREGATED_PRODUCTS_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: AGGREGATED_PRODUCTS_DATASET_QUERY,
});
export const AGGREGATED_PRODUCTS_COLUMNS = {
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
export const AGGREGATED_PRODUCTS_ROW_VALUES: Record<
  keyof typeof AGGREGATED_PRODUCTS_COLUMNS,
  RowValue
> = {
  CATEGORY: "Doohickey",
  count: 42,
};

export const ORDERS_WITH_CUSTOM_COLUMN_DATASET_QUERY: StructuredDatasetQuery = {
  ...AGGREGATED_ORDERS_DATASET_QUERY,
  query: {
    ...AGGREGATED_ORDERS_DATASET_QUERY.query,
    expressions: {
      CustomColumn: ["+", 1, 1],
      CustomTax: [
        "+",
        [
          "field",
          ORDERS.TAX,
          {
            "base-type": "type/Float",
          },
        ],
        2,
      ],
    },
    aggregation: [
      ...(AGGREGATED_ORDERS_DATASET_QUERY.query.aggregation || []),
      ["avg", ["expression", "CustomTax", { "base-type": "type/Number" }]],
    ],
    breakout: [
      ...(AGGREGATED_ORDERS_DATASET_QUERY.query.breakout || []),
      ["expression", "CustomColumn", { "base-type": "type/Integer" }],
    ],
  },
};

export const ORDERS_WITH_CUSTOM_COLUMN_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  dataset_query: ORDERS_WITH_CUSTOM_COLUMN_DATASET_QUERY,
});

export const ORDERS_WITH_CUSTOM_COLUMN_COLUMNS = {
  ...AGGREGATED_ORDERS_COLUMNS,
  CustomColumn: createMockColumn({
    base_type: "type/Integer",
    name: "CustomColumn",
    display_name: "CustomColumn",
    expression_name: "CustomColumn",
    field_ref: ["expression", "CustomColumn"],
    source: "breakout",
    effective_type: "type/Integer",
  }),
  avg: createMockColumn({
    base_type: "type/Float",
    name: "avg",
    display_name: "Average of CustomTax",
    source: "aggregation",
    field_ref: ["aggregation", 3],
    effective_type: "type/Float",
  }),
};
export const ORDERS_WITH_CUSTOM_COLUMN_ROW_VALUES = {
  ...AGGREGATED_ORDERS_ROW_VALUES,
  CustomColumn: 2,
  avg: 13.2,
};

export type ApplyDrillTestCaseWithCustomColumn = {
  clickType: "cell" | "header";
  columnName: keyof typeof ORDERS_WITH_CUSTOM_COLUMN_COLUMNS;
  drillArgs?: any[];
  customQuestion?: Question;
  expectedQuery: StructuredQueryApi;
};

export function getDrillsQueryParameters(
  queryType: "unaggregated" | "aggregated",
  queryTable: "ORDERS" | "PRODUCTS" = "ORDERS",
  customQuestion?: Question,
) {
  if (queryTable === "PRODUCTS") {
    return queryType === "unaggregated"
      ? {
          question: customQuestion || PRODUCTS_QUESTION,
          columns: PRODUCTS_COLUMNS,
          rowValues: PRODUCTS_ROW_VALUES,
        }
      : {
          question: customQuestion || AGGREGATED_PRODUCTS_QUESTION,
          columns: AGGREGATED_PRODUCTS_COLUMNS,
          rowValues: AGGREGATED_PRODUCTS_ROW_VALUES,
        };
  }

  return queryType === "unaggregated"
    ? {
        question: customQuestion || ORDERS_QUESTION,
        columns: ORDERS_COLUMNS,
        rowValues: ORDERS_ROW_VALUES,
      }
    : {
        question: customQuestion || AGGREGATED_ORDERS_QUESTION,
        columns: AGGREGATED_ORDERS_COLUMNS,
        rowValues: AGGREGATED_ORDERS_ROW_VALUES,
      };
}
