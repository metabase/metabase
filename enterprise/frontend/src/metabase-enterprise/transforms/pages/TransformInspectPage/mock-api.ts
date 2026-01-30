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
              id: "row-count-card",
              "section-id": "overview",
              title: "Row Count Over Time",
              display: "line",
              dataset_query: {
                database: 1,
                type: "query",
                query: {
                  "source-table": 456,
                  aggregation: [["count"]],
                  breakout: [["field", 103, { "temporal-unit": "month" }]],
                },
              },
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
              id: "match-rate-card",
              "section-id": "join-metrics",
              title: "Match Rate by Source",
              display: "bar",
              dataset_query: {
                database: 1,
                type: "query",
                query: {
                  "source-table": 456,
                  aggregation: [["count"]],
                  breakout: [["field", 101, null]],
                },
              },
              interestingness: 0.9,
            },
            {
              id: "orphan-trend",
              "section-id": "join-metrics",
              title: "Orphaned Records Trend",
              display: "line",
              dataset_query: {
                database: 1,
                type: "query",
                query: {
                  "source-table": 123,
                  aggregation: [["count"]],
                  breakout: [["field", 2, { "temporal-unit": "week" }]],
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
              id: "amount-dist-source",
              "section-id": "numeric",
              title: "Total Amount (Source)",
              display: "bar",
              dataset_query: {
                database: 1,
                type: "query",
                query: {
                  "source-table": 123,
                  aggregation: [["count"]],
                  breakout: [
                    [
                      "field",
                      3,
                      { binning: { strategy: "num-bins", "num-bins": 10 } },
                    ],
                  ],
                },
              },
              interestingness: 0.6,
            },
            {
              id: "amount-dist-output",
              "section-id": "numeric",
              title: "Total Amount (Output)",
              display: "bar",
              dataset_query: {
                database: 1,
                type: "query",
                query: {
                  "source-table": 456,
                  aggregation: [["count"]],
                  breakout: [
                    [
                      "field",
                      104,
                      { binning: { strategy: "num-bins", "num-bins": 10 } },
                    ],
                  ],
                },
              },
              interestingness: 0.6,
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
