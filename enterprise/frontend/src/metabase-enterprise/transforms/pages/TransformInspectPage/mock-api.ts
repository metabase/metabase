/* eslint-disable no-color-literals */

import type {
  TransformInspectResponse,
  TransformLensResponse,
} from "./mock-types";

export const fetchTransformInspect = (
  transformId: number,
): Promise<TransformInspectResponse> => {
  // eslint-disable-next-line no-console
  console.log(
    "%c[Mock API]%c GET /api/ee/transform/%s/inspect",
    "background: #7c3aed; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
    "color: #7c3aed; font-weight: bold;",
    transformId,
  );

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        name: "Transform Inspector: My Transform",
        sources: [
          {
            "table-id": 123,
            "table-name": "orders",
            schema: "public",
            "db-id": 1,
            "column-count": 12,
            fields: [
              {
                id: 1,
                name: "customer_id",
                "display-name": "Customer ID",
                "base-type": ":type/Integer",
                "semantic-type": ":type/FK",
              },
              {
                id: 2,
                name: "order_date",
                "display-name": "Order Date",
                "base-type": ":type/DateTime",
              },
              {
                id: 3,
                name: "total_amount",
                "display-name": "Total Amount",
                "base-type": ":type/Decimal",
                "semantic-type": ":type/Currency",
              },
            ],
          },
          {
            "table-id": 124,
            "table-name": "customers",
            schema: "public",
            "db-id": 1,
            "column-count": 8,
            fields: [
              {
                id: 10,
                name: "id",
                "display-name": "ID",
                "base-type": ":type/Integer",
                "semantic-type": ":type/PK",
              },
              {
                id: 11,
                name: "name",
                "display-name": "Name",
                "base-type": ":type/Text",
              },
              {
                id: 12,
                name: "email",
                "display-name": "Email",
                "base-type": ":type/Text",
                "semantic-type": ":type/Email",
              },
            ],
          },
          {
            "table-id": 125,
            "table-name": "products",
            schema: "public",
            "db-id": 1,
            "column-count": 6,
            fields: [
              {
                id: 20,
                name: "id",
                "display-name": "ID",
                "base-type": ":type/Integer",
                "semantic-type": ":type/PK",
              },
              {
                id: 21,
                name: "name",
                "display-name": "Name",
                "base-type": ":type/Text",
              },
              {
                id: 22,
                name: "price",
                "display-name": "Price",
                "base-type": ":type/Decimal",
                "semantic-type": ":type/Currency",
              },
            ],
          },
        ],
        target: {
          "table-id": 456,
          "table-name": "enriched_orders",
          schema: "transforms",
          "column-count": 18,
          fields: [
            {
              id: 101,
              name: "customer_id",
              "display-name": "Customer ID",
              "base-type": ":type/Integer",
              "semantic-type": ":type/FK",
            },
            {
              id: 102,
              name: "customer_name",
              "display-name": "Customer Name",
              "base-type": ":type/Text",
            },
            {
              id: 103,
              name: "order_date",
              "display-name": "Order Date",
              "base-type": ":type/DateTime",
            },
            {
              id: 104,
              name: "total_amount",
              "display-name": "Total Amount",
              "base-type": ":type/Decimal",
              "semantic-type": ":type/Currency",
            },
          ],
        },
        "available-lenses": [
          {
            id: "generic-summary",
            "display-name": "Data Summary",
            description: "Overview of input/output tables",
          },
          {
            id: "join-analysis",
            "display-name": "Join Analysis",
            description: "Analyze join quality and match rates",
          },
          {
            id: "column-comparison",
            "display-name": "Column Distributions",
            description: "Compare input/output column distributions",
          },
        ],
      });
    }, 500); // Simulate network delay
  });
};

const mockDatasetQuery = {
  "lib/type": "mbql/query",
  "lib/metadata": null,
  stages: [
    {
      "lib/type": "mbql.stage/mbql",
      source_table: 2,
      aggregation: [
        [
          "count",
          {
            "lib/uuid": "37c58b18-3f19-448d-86c5-0f40ac07e845",
          },
        ],
      ],
      breakout: [
        [
          "field",
          {
            "lib/uuid": "777a6b62-4a4f-4836-9f33-e94ac04cd27a",
            effective_type: "type/DateTime",
            base_type: "type/DateTime",
            temporal_unit: "day",
          },
          13,
        ],
      ],
    },
  ],
  database: 1,
};

export const fetchTransformLens = (
  transformId: number,
  lensId: string,
): Promise<TransformLensResponse> => {
  // eslint-disable-next-line no-console
  console.log(
    "%c[Mock API]%c GET /api/ee/transform/%s/lens/%s",
    "background: #7c3aed; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
    "color: #7c3aed; font-weight: bold;",
    transformId,
    lensId,
  );

  // Sample DB IDs - these match e2e/support/cypress_sample_database.json
  const SAMPLE_DB_ID = 1;
  const ORDERS_ID = 1;
  const ORDERS = { CREATED_AT: 8, TOTAL: 6, QUANTITY: 9, PRODUCT_ID: 3 };
  const PRODUCTS_ID = 7;
  const PRODUCTS = { CATEGORY: 51, PRICE: 53, CREATED_AT: 55 };
  const PEOPLE_ID = 2;
  const PEOPLE = { SOURCE: 18, CREATED_AT: 22 };

  return new Promise((resolve) => {
    setTimeout(() => {
      const lensData: Record<string, TransformLensResponse> = {
        "generic-summary": {
          id: "generic-summary",
          "display-name": "Data Summary",
          layout: "flat",
          summary: {
            text: "This transform combines 3 source tables into 1 enriched output table with 18 columns.",
            alerts: [],
            highlights: [
              { label: "Source Tables", value: 3, "card-id": "source-count" },
              { label: "Output Columns", value: 18, "card-id": "output-cols" },
              { label: "Row Count", value: "12,345", "card-id": "row-count" },
            ],
          },
          "drill-lenses": [],
          sections: [{ id: "overview", title: "Overview" }],
          cards: [
            {
              id: "orders-over-time",
              "section-id": "overview",
              title: "Orders Over Time",
              display: "line",
              dataset_query: mockDatasetQuery,
              interestingness: 0.8,
            },
          ],
        },
        "join-analysis": {
          id: "join-analysis",
          "display-name": "Join Analysis",
          layout: "comparison",
          summary: {
            text: "Join quality is excellent with 98.5% match rate between orders and customers.",
            alerts: ["2 orphaned records found in orders table"],
            highlights: [
              { label: "Match Rate", value: "98.5%", "card-id": "match-rate" },
              { label: "Matched Rows", value: "12,159", "card-id": "matched" },
              { label: "Orphaned Rows", value: 2, "card-id": "orphaned" },
            ],
          },
          "drill-lenses": [
            {
              id: "orphan-analysis",
              "display-name": "Orphan Analysis",
              description: "Investigate unmatched records",
            },
          ],
          sections: [
            { id: "join-metrics", title: "Join Metrics" },
            { id: "distribution", title: "Distribution" },
          ],
          cards: [
            {
              id: "orders-by-product-category",
              "section-id": "join-metrics",
              title: "Orders by Product Category",
              display: "bar",
              dataset_query: {
                database: SAMPLE_DB_ID,
                type: "query",
                query: {
                  "source-table": ORDERS_ID,
                  aggregation: [["count"]],
                  breakout: [
                    [
                      "field",
                      PRODUCTS.CATEGORY,
                      { "source-field": ORDERS.PRODUCT_ID },
                    ],
                  ],
                },
              },
              interestingness: 0.9,
            },
            {
              id: "orders-trend-weekly",
              "section-id": "join-metrics",
              title: "Orders Trend (Weekly)",
              display: "line",
              dataset_query: {
                database: SAMPLE_DB_ID,
                type: "query",
                query: {
                  "source-table": ORDERS_ID,
                  aggregation: [["count"]],
                  breakout: [
                    ["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }],
                  ],
                },
              },
              interestingness: 0.7,
            },
          ],
        },
        "column-comparison": {
          id: "column-comparison",
          "display-name": "Column Distributions",
          layout: "comparison",
          summary: {
            text: "Comparing distributions of key columns between source and output tables.",
            alerts: [],
            highlights: [
              { label: "Columns Analyzed", value: 8, "card-id": "col-count" },
              { label: "Distribution Shifts", value: 1, "card-id": "shifts" },
            ],
          },
          "drill-lenses": [],
          sections: [
            { id: "numeric", title: "Numeric Columns" },
            { id: "categorical", title: "Categorical Columns" },
          ],
          cards: [
            {
              id: "order-total-distribution",
              "section-id": "numeric",
              title: "Order Total Distribution",
              display: "bar",
              dataset_query: {
                database: SAMPLE_DB_ID,
                type: "query",
                query: {
                  "source-table": ORDERS_ID,
                  aggregation: [["count"]],
                  breakout: [
                    [
                      "field",
                      ORDERS.TOTAL,
                      { binning: { strategy: "num-bins", "num-bins": 10 } },
                    ],
                  ],
                },
              },
              interestingness: 0.6,
            },
            {
              id: "product-price-distribution",
              "section-id": "numeric",
              title: "Product Price Distribution",
              display: "bar",
              dataset_query: {
                database: SAMPLE_DB_ID,
                type: "query",
                query: {
                  "source-table": PRODUCTS_ID,
                  aggregation: [["count"]],
                  breakout: [
                    [
                      "field",
                      PRODUCTS.PRICE,
                      { binning: { strategy: "num-bins", "num-bins": 10 } },
                    ],
                  ],
                },
              },
              interestingness: 0.6,
            },
            {
              id: "products-by-category",
              "section-id": "categorical",
              title: "Products by Category",
              display: "bar",
              dataset_query: {
                database: SAMPLE_DB_ID,
                type: "query",
                query: {
                  "source-table": PRODUCTS_ID,
                  aggregation: [["count"]],
                  breakout: [["field", PRODUCTS.CATEGORY, null]],
                },
              },
              interestingness: 0.7,
            },
            {
              id: "people-by-source",
              "section-id": "categorical",
              title: "People by Source",
              display: "bar",
              dataset_query: {
                database: SAMPLE_DB_ID,
                type: "query",
                query: {
                  "source-table": PEOPLE_ID,
                  aggregation: [["count"]],
                  breakout: [["field", PEOPLE.SOURCE, null]],
                },
              },
              interestingness: 0.5,
            },
          ],
        },
      };

      const response = lensData[lensId] || {
        id: lensId,
        "display-name": lensId,
        layout: "flat" as const,
        summary: {
          text: "No data available for this lens.",
          alerts: [],
          highlights: [],
        },
        "drill-lenses": [],
        sections: [],
        cards: [],
      };

      resolve(response);
    }, 300); // Simulate network delay
  });
};
