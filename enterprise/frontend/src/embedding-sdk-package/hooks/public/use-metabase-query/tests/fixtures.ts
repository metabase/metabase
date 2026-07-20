/* eslint-disable metabase/no-external-references-for-sdk-package-code */

import { createMockCard } from "metabase-types/api/mocks";

const column = <
  TFieldId extends number,
  TTableId extends number,
  TName extends string,
  TDisplayName extends string,
  TJsType extends string,
  TOptions extends object = object,
>(
  fieldId: TFieldId,
  tableId: TTableId,
  name: TName,
  displayName: TDisplayName,
  jsType: TJsType,
  // The empty default has the caller's inferred override shape.
  options = {} as TOptions,
) => ({
  type: "column" as const,
  fieldId,
  tableId,
  name,
  displayName,
  jsType,
  ...options,
});

const joinedColumn = <
  TFieldId extends number,
  TName extends string,
  TDisplayName extends string,
  TJsType extends string,
>(
  fieldId: TFieldId,
  sourceFieldId: number,
  name: TName,
  displayName: TDisplayName,
  jsType: TJsType,
) => ({
  type: "column" as const,
  fieldId,
  sourceFieldId,
  name,
  displayName,
  jsType,
});

const metadataField = (
  id: number,
  tableId: number,
  name: string,
  displayName: string,
  baseType: string,
  options: object = {},
) => ({
  id,
  table_id: tableId,
  name,
  display_name: displayName,
  base_type: baseType,
  effective_type: baseType,
  ...options,
});

const cardMetadata = (
  id: number,
  name: string,
  sourceTable: number,
  aggregation?: [["sum", ["field", number, null]]],
) =>
  createMockCard({
    id,
    name,
    ...(aggregation && { type: "metric" }),
    dataset_query: {
      type: "query",
      database: 1,
      query: {
        "source-table": sourceTable,
        ...(aggregation && { aggregation }),
      },
    },
  });

export const TEST_SCHEMA = {
  tables: {
    orders: {
      type: "table" as const,
      id: 1,
      fields: {
        id: column(100, 1, "ID", "ID", "number"),
        createdAt: column(103, 1, "CREATED_AT", "Created At", "Date", {
          baseType: "type/DateTime",
        }),
        amount: column(102, 1, "AMOUNT", "Amount", "number"),
        status: column(101, 1, "STATUS", "Status", "string"),
      },
      segments: {
        completed: { type: "segment" as const, id: 11, tableId: 1 },
      },
      measures: {
        revenue: {
          type: "measure" as const,
          id: 21,
          tableId: 1,
          columns: [{ name: "sum", displayName: "Sum", jsType: "number" }],
        },
      },
    },
    products: {
      type: "table" as const,
      id: 2,
      fields: {
        price: column(201, 2, "PRICE", "Price", "number"),
      },
      segments: {
        active: { type: "segment" as const, id: 12, tableId: 2 },
      },
      measures: {
        price: {
          type: "measure" as const,
          id: 22,
          tableId: 2,
          columns: [{ name: "price", displayName: "Price", jsType: "number" }],
        },
      },
    },
  },
  metrics: {
    revenue: {
      type: "metric" as const,
      id: 31,
      sourceTableId: 1,
      mappedTableIds: [1, 2],
      columns: [{ name: "sum", displayName: "Revenue", jsType: "number" }],
      dimensions: {
        orders: {
          amount: column(102, 1, "AMOUNT", "Amount", "number"),
          createdAt: column(103, 1, "CREATED_AT", "Created At", "Date", {
            baseType: "type/DateTime",
          }),
          status: column(101, 1, "STATUS", "Status", "string"),
          product: joinedColumn(202, 104, "NAME", "Name", "string"),
        },
      },
    },
    productRevenue: {
      type: "metric" as const,
      id: 32,
      sourceTableId: 2,
      mappedTableIds: [2],
    },
    questionRevenue: {
      type: "metric" as const,
      id: 33,
      sourceCardId: 41,
    },
  },
  questions: {
    ordersQuestion: {
      type: "card" as const,
      id: 41,
      columns: [
        {
          type: "column" as const,
          name: "STATUS",
          displayName: "Status",
          jsType: "string",
        },
        {
          type: "column" as const,
          name: "AMOUNT",
          displayName: "Amount",
          jsType: "number",
        },
      ],
    },
  },
} as const;

export const TEST_METADATA = {
  databases: {
    1: {
      id: 1,
      name: "Test Database",
      features: ["basic-aggregations", "binning", "expressions"],
    },
  },
  tables: {
    1: { id: 1, db_id: 1, name: "orders", display_name: "Orders" },
    2: { id: 2, db_id: 1, name: "products", display_name: "Products" },
  },
  fields: {
    100: metadataField(100, 1, "ID", "ID", "type/Integer"),
    101: metadataField(101, 1, "STATUS", "Status", "type/Text"),
    102: metadataField(102, 1, "AMOUNT", "Amount", "type/Float"),
    103: metadataField(103, 1, "CREATED_AT", "Created At", "type/DateTime"),
    104: metadataField(104, 1, "PRODUCT_ID", "Product ID", "type/Integer", {
      semantic_type: "type/FK",
      fk_target_field_id: 200,
    }),
    200: metadataField(200, 2, "ID", "ID", "type/Integer", {
      semantic_type: "type/PK",
    }),
    202: metadataField(202, 2, "NAME", "Name", "type/Text"),
  },
  segments: {
    11: { id: 11, table_id: 1, name: "Completed" },
  },
  measures: {
    21: {
      id: 21,
      name: "Revenue",
      table_id: 1,
      definition: {
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["count"]],
        },
      },
    },
  },
  questions: {
    41: cardMetadata(41, "Orders question", 1),
    31: cardMetadata(31, "Revenue", 1, [["sum", ["field", 102, null]]]),
  },
};
