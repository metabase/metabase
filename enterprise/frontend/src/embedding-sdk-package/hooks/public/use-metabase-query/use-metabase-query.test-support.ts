import type { MetricSchema, TableSchema } from "../data-schema";

type DataSchemaFixture = {
  tables: Record<string, TableSchema>;
  metrics: Record<string, MetricSchema>;
};

export const TEST_TABLES = {
  orders: {
    id: 1,
    databaseId: 1,
    fields: {
      id: {
        fieldId: 100,
        tableId: 1,
        name: "id",
        displayName: "ID",
        jsType: "number",
      },
      createdAt: {
        fieldId: 103,
        tableId: 1,
        name: "created_at",
        displayName: "Created At",
        jsType: "Date",
        baseType: "type/DateTime",
      },
      orderDate: {
        fieldId: 105,
        tableId: 1,
        name: "order_date",
        displayName: "Order Date",
        jsType: "Date",
        baseType: "type/Date",
      },
      amount: {
        fieldId: 102,
        tableId: 1,
        name: "amount",
        displayName: "Amount",
        jsType: "number",
      },
      status: {
        fieldId: 101,
        tableId: 1,
        name: "status",
        displayName: "Status",
        jsType: "string",
      },
      franchiseId: {
        fieldId: 106,
        tableId: 1,
        name: "franchise_id",
        displayName: "Franchise ID",
        jsType: "number",
      },
      internalCode: {
        fieldId: 104,
        tableId: 1,
        name: "internal_code",
        displayName: "Internal Code",
        jsType: "string",
      },
    },
    segments: {
      completed: { kind: "segment", id: 11, tableId: 1 },
    },
    measures: {
      revenue: {
        kind: "measure",
        id: 21,
        tableId: 1,
        columns: [{ name: "sum", displayName: "Sum", jsType: "number" }],
      },
    },
  },
  products: {
    id: 2,
    databaseId: 1,
    fields: {
      price: {
        fieldId: 201,
        tableId: 2,
        name: "price",
        displayName: "Price",
        jsType: "number",
      },
    },
    segments: {
      active: { kind: "segment", id: 12, tableId: 2 },
    },
    measures: {
      price: {
        kind: "measure",
        id: 22,
        tableId: 2,
        columns: [{ name: "price", displayName: "Price", jsType: "number" }],
      },
    },
  },
  franchises: {
    id: 3,
    databaseId: 1,
    fields: {
      name: {
        fieldId: 301,
        tableId: 3,
        name: "name",
        displayName: "Name",
        jsType: "string",
      },
    },
  },
} as const satisfies Record<string, TableSchema>;

export const TEST_SCHEMA = {
  tables: TEST_TABLES,
  metrics: {
    orderCount: {
      id: 34,
      databaseId: 1,
      sourceTableId: 1,
      columns: [{ name: "count", displayName: "Count", jsType: "number" }],
      dimensions: {
        orders: {
          id: TEST_TABLES.orders.fields.id,
          status: TEST_TABLES.orders.fields.status,
          amount: TEST_TABLES.orders.fields.amount,
          createdAt: TEST_TABLES.orders.fields.createdAt,
          orderDate: TEST_TABLES.orders.fields.orderDate,
        },
        franchises: {
          name: {
            ...TEST_TABLES.franchises.fields.name,
            sourceFieldId: TEST_TABLES.orders.fields.franchiseId.fieldId,
          },
        },
      },
      mappedTableIds: [1, 3],
    },
    orderValue: {
      id: 35,
      databaseId: 1,
      sourceTableId: 1,
      columns: [{ name: "sum", displayName: "Sum", jsType: "number" }],
      dimensions: {
        orders: {
          id: TEST_TABLES.orders.fields.id,
          status: TEST_TABLES.orders.fields.status,
          amount: TEST_TABLES.orders.fields.amount,
          createdAt: TEST_TABLES.orders.fields.createdAt,
          orderDate: TEST_TABLES.orders.fields.orderDate,
        },
      },
      mappedTableIds: [1],
    },
    orderCountFromModel: {
      id: 36,
      databaseId: 1,
      sourceCardId: 98,
      columns: [{ name: "count", displayName: "Count", jsType: "number" }],
      dimensions: {
        orders: {
          id: TEST_TABLES.orders.fields.id,
          status: TEST_TABLES.orders.fields.status,
          amount: TEST_TABLES.orders.fields.amount,
          createdAt: TEST_TABLES.orders.fields.createdAt,
          orderDate: TEST_TABLES.orders.fields.orderDate,
        },
      },
      mappedTableIds: [1],
    },
  },
} as const satisfies DataSchemaFixture;

export type TestSchema = typeof TEST_SCHEMA;
export type OrdersTable = TestSchema["tables"]["orders"];
export type OrderCountMetric = TestSchema["metrics"]["orderCount"];
