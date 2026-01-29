/* eslint-disable no-color-literals */

import type { TransformInspectResponse } from "./mock-types";

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
