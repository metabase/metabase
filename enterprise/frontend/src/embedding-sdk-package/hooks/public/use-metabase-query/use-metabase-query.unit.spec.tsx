import { createMetabaseQuery as createMetabaseQueryInBundle } from "metabase/embedding-sdk/lib/create-metabase-query";
import type { DatasetQuery } from "metabase-types/api";

import * as DataApp from "../../../data-app";

import type { MetabaseQueryOptions } from "./use-metabase-query";
import {
  breakout,
  count,
  filter,
  sum,
  useMetabaseQuery,
} from "./use-metabase-query";

const TEST_SCHEMA = {
  tables: {
    orders: {
      type: "table",
      id: 1,
      databaseId: 1,
      fields: {
        id: {
          type: "column",
          fieldId: 100,
          tableId: 1,
          name: "ID",
          displayName: "ID",
          jsType: "number",
        },
        createdAt: {
          type: "column",
          fieldId: 103,
          tableId: 1,
          name: "CREATED_AT",
          displayName: "Created At",
          jsType: "Date",
          baseType: "type/DateTime",
        },
        amount: {
          type: "column",
          fieldId: 102,
          tableId: 1,
          name: "AMOUNT",
          displayName: "Amount",
          jsType: "number",
        },
        status: {
          type: "column",
          fieldId: 101,
          tableId: 1,
          name: "STATUS",
          displayName: "Status",
          jsType: "string",
        },
      },
      segments: {
        completed: { type: "segment", id: 11, tableId: 1 },
      },
      measures: {
        revenue: {
          type: "measure",
          id: 21,
          tableId: 1,
          columns: [{ name: "sum", displayName: "Sum", jsType: "number" }],
        },
      },
    },
    products: {
      type: "table",
      id: 2,
      databaseId: 1,
      fields: {
        price: {
          type: "column",
          fieldId: 201,
          tableId: 2,
          name: "PRICE",
          displayName: "Price",
          jsType: "number",
        },
      },
      segments: {
        active: { type: "segment", id: 12, tableId: 2 },
      },
      measures: {
        price: {
          type: "measure",
          id: 22,
          tableId: 2,
          columns: [{ name: "price", displayName: "Price", jsType: "number" }],
        },
      },
    },
  },
} as const;

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];

const _validTableQuery = {
  source: TEST_SCHEMA.tables.orders,
  fields: [
    TEST_SCHEMA.tables.orders.fields.id,
    TEST_SCHEMA.tables.orders.fields.status,
  ],
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
  ],
  aggregations: [
    TEST_SCHEMA.tables.orders.measures.revenue,
    sum(TEST_SCHEMA.tables.orders.fields.amount),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
  ],
  limit: 100,
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableSegmentQuery = {
  source: TEST_SCHEMA.tables.orders,
  filters: [
    // @ts-expect-error segments must belong to the source table
    TEST_SCHEMA.tables.products.segments.active,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableMeasureQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error measures must belong to the source table
    TEST_SCHEMA.tables.products.measures.price,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableFieldQuery = {
  source: TEST_SCHEMA.tables.orders,
  fields: [
    // @ts-expect-error fields must belong to the source table
    TEST_SCHEMA.tables.products.fields.price,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

function TypeFixtures() {
  useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    fields: [TEST_SCHEMA.tables.orders.fields.id],
  });

  const scalarAggregationResult = useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [sum(TEST_SCHEMA.tables.orders.fields.amount)],
  });

  const scalarAggregationValue: number | null | undefined =
    scalarAggregationResult.data?.rows[0]?.sum;

  void scalarAggregationValue;

  // @ts-expect-error grouped queries must include an explicit aggregation
  useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    breakouts: [
      breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
    ],
  });

  return null;
}

void TypeFixtures;

describe("createMetabaseQuery", () => {
  it("exports the table query DSL from the data-app entrypoint", () => {
    expect(DataApp).toMatchObject({
      aggregations: {
        avg: expect.any(Function),
        count: expect.any(Function),
        distinct: expect.any(Function),
        max: expect.any(Function),
        median: expect.any(Function),
        min: expect.any(Function),
        sum: expect.any(Function),
      },
      breakout: expect.any(Function),
      createMetabaseQuery: expect.any(Function),
      filter: expect.any(Function),
      useMetabaseQuery: expect.any(Function),
      useMetabaseQueryObject: expect.any(Function),
    });
    expect(DataApp).not.toHaveProperty("count");
    expect(DataApp).not.toHaveProperty("sum");
  });

  it("passes the public source DSL through Lib.createTestQuery", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.tables.orders,
      fields: [
        TEST_SCHEMA.tables.orders.fields.id,
        TEST_SCHEMA.tables.orders.fields.status,
      ],
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
      ],
      aggregations: [count(), sum(TEST_SCHEMA.tables.orders.fields.amount)],
      breakouts: [
        breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
      ],
      limit: 100,
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          fields: [
            ["field", expect.anything(), 100],
            ["field", expect.anything(), 101],
          ],
          filters: [
            ["segment", expect.anything(), 11],
            ["=", expect.anything(), ["field", expect.anything(), 101], "paid"],
          ],
          aggregation: [
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
          limit: 100,
        },
      ],
    });
  });

  it("passes generated table Measures to Lib.createTestQuery measure aggregations", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
    });

    expect(
      (datasetQuery as DatasetQuery & { stages: any[] }).stages[0].aggregation,
    ).toEqual([["measure", expect.anything(), 21]]);
  });

  it("rejects invalid limits with a clear error message", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.tables.orders,
        limit: 0,
      }),
    ).toThrow("Table query limit must be a positive integer.");
  });

  it("rejects cross-table query clauses with clear error messages", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.tables.orders,
        fields: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).toThrow(
      "Table query fields must belong to source table 1, but received table id 2.",
    );

    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.tables.orders,
        filters: [filter(TEST_SCHEMA.tables.products.fields.price, "=", 10)],
      }),
    ).toThrow(
      "Table query filters must belong to source table 1, but received table id 2.",
    );

    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [sum(TEST_SCHEMA.tables.products.fields.price)],
      }),
    ).toThrow(
      "Table query aggregations must belong to source table 1, but received table id 2.",
    );

    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.tables.orders,
        breakouts: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).toThrow(
      "Table query breakouts must belong to source table 1, but received table id 2.",
    );
  });
});
