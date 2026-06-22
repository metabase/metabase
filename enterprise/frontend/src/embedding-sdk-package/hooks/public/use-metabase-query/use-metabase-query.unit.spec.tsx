import { act, waitFor } from "@testing-library/react";

import { render, screen } from "__support__/ui";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { createMetabaseQuery as createMetabaseQueryInBundle } from "metabase/embedding-sdk/lib/create-metabase-query";

import type { MetabaseQueryOptions } from "./use-metabase-query";
import {
  avg,
  breakout,
  count,
  createMetabaseQuery,
  distinct,
  filter,
  max,
  median,
  min,
  sum,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "./use-metabase-query";

type Equals<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;
type Expect<TValue extends true> = TValue;

const TEST_TABLES = {
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
} as const;

const TEST_SCHEMA = {
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
} as const;

type TestSchema = typeof TEST_SCHEMA;
type OrdersTable = TestSchema["tables"]["orders"];
type OrderCountMetric = TestSchema["metrics"]["orderCount"];

const _validTableCustomFilterQuery = {
  table: TEST_SCHEMA.tables.orders,
  filters: [
    filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
    filter(TEST_SCHEMA.tables.orders.fields.amount, ">", 10),
    filter(TEST_SCHEMA.tables.orders.fields.amount, "between", [10, 20]),
    filter(TEST_SCHEMA.tables.orders.fields.status, "not-empty"),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableCustomFilterObjectQuery = {
  table: TEST_SCHEMA.tables.orders,
  filters: [
    {
      dimension: TEST_SCHEMA.tables.orders.fields.status,
      operator: "=",
      value: "paid",
    },
    {
      dimension: TEST_SCHEMA.tables.orders.fields.amount,
      operator: ">",
      value: 10,
    },
    {
      dimension: TEST_SCHEMA.tables.orders.fields.amount,
      operator: "between",
      values: [10, 20],
    },
    {
      dimension: TEST_SCHEMA.tables.orders.fields.status,
      operator: "not-empty",
    },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableBreakoutBucketQuery = {
  table: TEST_SCHEMA.tables.orders,
  breakouts: [
    breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { bucket: "month" }),
    breakout(TEST_SCHEMA.tables.orders.fields.amount, {
      binning: { strategy: "num-bins", "num-bins": 10 },
    }),
    breakout(TEST_SCHEMA.tables.orders.fields.status),
    {
      dimension: TEST_SCHEMA.tables.orders.fields.createdAt,
      bucket: "month",
    },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableAdHocMeasureQuery = {
  table: TEST_SCHEMA.tables.orders,
  measures: [
    // @ts-expect-error table measures must use generated schema.tables.*.measures.* objects
    { name: "count" },
  ],
} satisfies MetabaseQueryOptions;

const _invalidTableBreakoutUnknownBucketQuery = {
  table: TEST_SCHEMA.tables.orders,
  breakouts: [
    breakout(TEST_SCHEMA.tables.orders.fields.createdAt, {
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      bucket: "aaaa",
    }),
    {
      dimension: TEST_SCHEMA.tables.orders.fields.createdAt,
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      bucket: "aaaa",
    },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableBreakoutNonDateBucketQuery = {
  table: TEST_SCHEMA.tables.orders,
  breakouts: [
    // @ts-expect-error non-date dimensions do not support temporal buckets
    breakout(TEST_SCHEMA.tables.orders.fields.status, { bucket: "month" }),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableCustomFilterOperatorQuery = {
  table: TEST_SCHEMA.tables.orders,
  filters: [
    // @ts-expect-error number dimensions do not support string operators
    filter(TEST_SCHEMA.tables.orders.fields.amount, "contains", "10"),
    // @ts-expect-error string dimensions do not support numeric comparison operators
    filter(TEST_SCHEMA.tables.orders.fields.status, ">", "paid"),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableCustomFilterQuery = {
  table: TEST_SCHEMA.tables.orders,
  filters: [
    {
      // @ts-expect-error custom filter dimensions must belong to the table schema
      dimension: TEST_SCHEMA.tables.products.fields.price,
      operator: "=",
      value: 10,
    },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableAggregationQuery = {
  table: TEST_SCHEMA.tables.orders,
  aggregations: [
    sum(TEST_SCHEMA.tables.orders.fields.amount),
    avg(TEST_SCHEMA.tables.orders.fields.amount),
    median(TEST_SCHEMA.tables.orders.fields.amount),
    min(TEST_SCHEMA.tables.orders.fields.status),
    max(TEST_SCHEMA.tables.orders.fields.createdAt),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableAggregationQuery = {
  table: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error sum only supports numeric dimensions
    sum(TEST_SCHEMA.tables.orders.fields.status),
    // @ts-expect-error avg only supports numeric dimensions
    avg(TEST_SCHEMA.tables.orders.fields.createdAt),
    // @ts-expect-error median only supports numeric dimensions
    median(TEST_SCHEMA.tables.orders.fields.status),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validMetricScopedQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  filters: [TEST_SCHEMA.tables.orders.segments.completed],
  measures: [TEST_SCHEMA.tables.orders.measures.revenue],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _validMetricObjectQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  filters: [TEST_SCHEMA.tables.orders.segments.completed],
  measures: [TEST_SCHEMA.tables.orders.measures.revenue],
  breakouts: [
    {
      dimension: TEST_SCHEMA.metrics.orderCount.dimensions.orders.createdAt,
      bucket: "month",
    },
  ],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _validMetricMappedTableBreakoutQuery = {
  metric: TEST_SCHEMA.metrics.orderValue,
  measures: [TEST_SCHEMA.tables.orders.measures.revenue],
  breakouts: [
    breakout(TEST_SCHEMA.metrics.orderValue.dimensions.orders.createdAt, {
      bucket: "month",
    }),
  ],
} satisfies MetabaseQueryOptions<
  TestSchema["metrics"]["orderValue"],
  TestSchema
>;

const _invalidMetricBreakoutUnknownBucketQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  breakouts: [
    {
      dimension: TEST_SCHEMA.metrics.orderCount.dimensions.orders.createdAt,
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      bucket: "aaaa",
    },
  ],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricBreakoutNonDateBucketQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  breakouts: [
    breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.status, {
      // @ts-expect-error non-date dimensions do not support temporal buckets
      bucket: "month",
    }),
  ],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

function useMetricBreakoutTypeFixtures() {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    breakouts: [
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.createdAt, {
        bucket: "month",
      }),
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.amount, {
        binning: { strategy: "num-bins", "num-bins": 10 },
      }),
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.status),
      {
        dimension: TEST_SCHEMA.metrics.orderCount.dimensions.orders.createdAt,
        bucket: "month",
      },
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.status),
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    breakouts: [
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.status, {
        // @ts-expect-error non-date table fields do not support temporal buckets
        bucket: "month",
      }),
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    // @ts-expect-error metric table field breakouts must come from mapped tables
    breakouts: [breakout(TEST_SCHEMA.tables.products.fields.price)],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    // @ts-expect-error metric table field breakouts must use generated metric dimensions
    breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.internalCode)],
  });
}

void useMetricBreakoutTypeFixtures;

function useMetricFilterOperatorTypeFixtures() {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      filter(
        TEST_SCHEMA.metrics.orderCount.dimensions.orders.status,
        "contains",
        "paid",
      ),
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      filter(
        TEST_SCHEMA.metrics.orderCount.dimensions.orders.status,
        "contains",
        "paid",
      ),
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      {
        dimension: TEST_SCHEMA.metrics.orderCount.dimensions.orders.status,
        operator: "contains",
        value: "paid",
      },
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      filter(
        TEST_SCHEMA.metrics.orderCount.dimensions.orders.status,
        // @ts-expect-error string table fields do not support numeric comparison operators
        ">",
        "paid",
      ),
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    // @ts-expect-error metric table field filters must come from mapped tables
    filters: [filter(TEST_SCHEMA.tables.products.fields.price, ">", 10)],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    // @ts-expect-error metric table field filters must use generated metric dimensions
    filters: [filter(TEST_SCHEMA.tables.orders.fields.internalCode, "=", "x")],
  });
}

void useMetricFilterOperatorTypeFixtures;

function useAggregationResultTypeFixtures() {
  const _result = useMetabaseQuery({
    table: TEST_SCHEMA.tables.orders,
    aggregations: [
      min(TEST_SCHEMA.tables.orders.fields.status),
      max(TEST_SCHEMA.tables.orders.fields.createdAt),
      distinct(TEST_SCHEMA.tables.orders.fields.status),
    ],
  });

  type Row = NonNullable<typeof _result.data>["rows"][number];
  type _ExpectMinResult = Expect<Equals<Row["min"], string | null>>;
  type _ExpectMaxResult = Expect<Equals<Row["max"], string | Date | null>>;
  type _ExpectDistinctResult = Expect<Equals<Row["count"], number | null>>;
  type _ExpectDistinctNameFallsBackToUnknown = Expect<
    Equals<Row["distinct"], unknown>
  >;
}

void useAggregationResultTypeFixtures;

const _invalidMetricSegmentQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  // @ts-expect-error segments must belong to the metric's mapped tables
  filters: [TEST_SCHEMA.tables.products.segments.active],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricMeasureQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  // @ts-expect-error measures must belong to the metric's mapped tables
  measures: [TEST_SCHEMA.tables.products.measures.price],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricAdHocMeasureQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  measures: [
    // @ts-expect-error metric measures must use generated schema.tables.*.measures.* objects
    { name: "count" },
  ],
} satisfies MetabaseQueryOptions;

describe("useMetabaseQuery", () => {
  beforeEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
    window.METABASE_EMBEDDING_SDK_BUNDLE = {
      createMetabaseQuery: createMetabaseQueryInBundle,
    } as typeof window.METABASE_EMBEDDING_SDK_BUNDLE;
  });

  describe("createMetabaseQuery", () => {
    const expectedOrdersQuery = {
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        filter: ["=", ["field", 101, {}], "paid"],
        aggregation: [["count"]],
        breakout: [["field", 103, {}]],
      },
      parameters: [],
    };

    it("builds a complete dataset query from a generated table schema", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          filters: [
            filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
          ],
          breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.createdAt)],
        }),
      ).toEqual(expectedOrdersQuery);
    });

    it("builds a dataset query from minimal table metadata and referenced fields", () => {
      expect(
        createMetabaseQuery({
          table: {
            id: TEST_SCHEMA.tables.orders.id,
            databaseId: TEST_SCHEMA.tables.orders.databaseId,
          },
          filters: [
            filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
          ],
          breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.createdAt)],
        }),
      ).toEqual(expectedOrdersQuery);
    });

    it("memoizes a complete dataset query from a generated table schema", () => {
      render(<MetabaseQueryObjectComponent />);

      expect(
        JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
      ).toEqual(expectedOrdersQuery);
    });

    it("builds a query object after the SDK bundle loading state changes", () => {
      delete window.METABASE_EMBEDDING_SDK_BUNDLE;

      render(<MetabaseQueryObjectComponent />);

      expect(screen.getByTestId("query-object")).toHaveTextContent("null");

      window.METABASE_EMBEDDING_SDK_BUNDLE = {
        createMetabaseQuery: createMetabaseQueryInBundle,
      } as unknown as typeof window.METABASE_EMBEDDING_SDK_BUNDLE;

      act(() => {
        ensureMetabaseProviderPropsStore().updateInternalProps({
          loadingState: SdkLoadingState.Loaded,
        });
      });

      expect(
        JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
      ).toEqual(expectedOrdersQuery);
    });

    it("builds explicit count aggregations", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          aggregations: [count()],
          breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
        }),
      ).toEqual({
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["count"]],
          breakout: [["field", 101, {}]],
        },
        parameters: [],
      });
    });

    it("supports count aggregation object literals", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          aggregations: [{ type: "count" }],
          breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
        }),
      ).toMatchObject({
        query: {
          aggregation: [["count"]],
        },
      });
    });

    it("builds field aggregation helpers", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          aggregations: [
            sum(TEST_SCHEMA.tables.orders.fields.amount),
            avg(TEST_SCHEMA.tables.orders.fields.amount),
            distinct(TEST_SCHEMA.tables.orders.fields.status),
          ],
          breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
        }),
      ).toMatchObject({
        query: {
          aggregation: [
            ["sum", ["field", 102, {}]],
            ["avg", ["field", 102, {}]],
            ["distinct", ["field", 101, {}]],
          ],
          breakout: [["field", 101, {}]],
        },
      });
    });

    it("does not force minute bucketing for date filters", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          filters: [
            filter(
              TEST_SCHEMA.tables.orders.fields.orderDate,
              "=",
              "2026-06-18",
            ),
          ],
        }),
      ).toMatchObject({
        query: {
          filter: ["=", ["field", 105, {}], "2026-06-18"],
        },
      });
    });

    it("uses effective or base type to preserve time for datetime filters", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          filters: [
            filter(
              TEST_SCHEMA.tables.orders.fields.createdAt,
              "=",
              new Date(2026, 5, 18, 12, 30),
            ),
          ],
        }),
      ).toMatchObject({
        query: {
          filter: ["=", ["field", 103, {}], "2026-06-18T12:30:00"],
        },
      });
    });

    it("builds time-interval filters through metabase-lib", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          filters: [
            {
              dimension: TEST_SCHEMA.tables.orders.fields.createdAt,
              operator: "time-interval",
              values: [-30, "day", { includeCurrent: true }],
            },
          ],
        }),
      ).toMatchObject({
        query: {
          filter: [
            "time-interval",
            ["field", 103, {}],
            -30,
            "day",
            { "include-current": true },
          ],
        },
      });
    });

    it("does not build filters with operators unsupported by the field type", () => {
      expect(() =>
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          filters: [
            {
              dimension: TEST_SCHEMA.tables.orders.fields.amount,
              operator: "contains",
              value: "10",
            },
          ],
        }),
      ).toThrow(
        "Table query object creation requires a table reference with id and databaseId.",
      );

      expect(() =>
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          filters: [
            {
              dimension: TEST_SCHEMA.tables.orders.fields.status,
              operator: ">",
              value: "paid",
            },
          ],
        }),
      ).toThrow(
        "Table query object creation requires a table reference with id and databaseId.",
      );
    });

    it("supports field aggregation object literals", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          aggregations: [
            { type: "max", dimension: TEST_SCHEMA.tables.orders.fields.amount },
          ],
        }),
      ).toMatchObject({
        query: {
          aggregation: [["max", ["field", 102, {}]]],
        },
      });
    });

    it("preserves default binning when metabase-lib has no default strategy", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          breakouts: [
            breakout(TEST_SCHEMA.tables.orders.fields.amount, {
              binning: { strategy: "default" },
            }),
          ],
        }),
      ).toEqual({
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["count"]],
          breakout: [["field", 102, { binning: { strategy: "default" } }]],
        },
        parameters: [],
      });
    });

    it("builds binned table breakouts through metabase-lib", () => {
      expect(
        createMetabaseQuery({
          table: TEST_SCHEMA.tables.orders,
          breakouts: [
            breakout(TEST_SCHEMA.tables.orders.fields.amount, {
              binning: { strategy: "num-bins", "num-bins": 10 },
            }),
          ],
        }),
      ).toMatchObject({
        query: {
          breakout: [
            [
              "field",
              102,
              { binning: { strategy: "num-bins", "num-bins": 10 } },
            ],
          ],
        },
      });
    });

    it("builds a complete dataset query from a generated metric schema", () => {
      expect(
        createMetabaseQuery({
          metric: TEST_SCHEMA.metrics.orderCount,
          filters: [
            filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
          ],
          measures: [TEST_SCHEMA.tables.orders.measures.revenue],
          breakouts: [
            breakout(
              TEST_SCHEMA.metrics.orderCount.dimensions.orders.createdAt,
              {
                bucket: "month",
              },
            ),
          ],
        }),
      ).toEqual({
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [
            ["metric", 34],
            [
              "aggregation-options",
              ["measure", 21],
              { "display-name": "Measure 21" },
            ],
          ],
          filter: ["=", ["field", 101, {}], "paid"],
          breakout: [["field", 103, { "temporal-unit": "month" }]],
        },
        parameters: [],
      });
    });

    it("adds source-field when metric dimensions reference an implicitly joined table", () => {
      expect(
        createMetabaseQuery({
          metric: TEST_SCHEMA.metrics.orderCount,
          breakouts: [
            breakout(TEST_SCHEMA.metrics.orderCount.dimensions.franchises.name),
          ],
          filters: [
            filter(
              TEST_SCHEMA.metrics.orderCount.dimensions.franchises.name,
              "=",
              "West Coast Boba",
            ),
          ],
        }),
      ).toEqual({
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["metric", 34]],
          filter: [
            "=",
            ["field", 301, { "source-field": 106 }],
            "West Coast Boba",
          ],
          breakout: [["field", 301, { "source-field": 106 }]],
        },
        parameters: [],
      });
    });

    it("memoizes a complete dataset query from a generated metric schema", () => {
      render(<MetricQueryObjectComponent />);

      expect(
        JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
      ).toEqual({
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["metric", 34]],
          breakout: [["field", 101, {}]],
        },
        parameters: [],
      });
    });
  });

  it("raises a runtime error when metric segments are not from mapped tables", async () => {
    const queryDataset = jest.fn();

    setup({ queryDataset });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Metric query segments must belong to one of the query's mapped tables.",
      );
    });

    expect(queryDataset).not.toHaveBeenCalled();
  });

  it("raises a runtime error when table measures are not generated schema measures", async () => {
    const queryDataset = jest.fn();

    setup({
      queryDataset,
      component: <InvalidTableMeasureComponent />,
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Table query measures must use generated semantic-layer measures from schema.tables.*.measures.*.",
      );
    });

    expect(queryDataset).not.toHaveBeenCalled();
  });

  it("queries table fields generated with fieldId but no id", async () => {
    const queryDatasetApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryDataset = jest.fn(() => queryDatasetApi);

    setup({
      queryDataset,
      component: <TableFieldIdComponent />,
    });

    await waitFor(() => {
      expect(queryDatasetApi).toHaveBeenCalledWith({
        datasetQuery: {
          type: "query",
          database: 1,
          query: {
            "source-table": 1,
            filter: ["=", ["field", 101, {}], "paid"],
            aggregation: [["count"]],
            breakout: [["field", 101, {}]],
          },
          parameters: [],
        },
      });
    });
  });

  it("queries generated table objects via a memoized dataset query object", async () => {
    const queryDatasetApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryDataset = jest.fn(() => queryDatasetApi);

    setup({
      queryDataset,
      component: <TableObjectComponent />,
    });

    await waitFor(() => {
      expect(queryDatasetApi).toHaveBeenCalledWith({
        datasetQuery: {
          type: "query",
          database: 1,
          query: {
            "source-table": 1,
            filter: ["=", ["field", 101, {}], "paid"],
          },
          parameters: [],
        },
      });
    });
  });

  it("queries generated metrics with measures via the dataset endpoint", async () => {
    const queryDatasetApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryDataset = jest.fn(() => queryDatasetApi);

    setup({
      queryDataset,
      component: <MetricMeasuresComponent />,
    });

    await waitFor(() => {
      expect(queryDatasetApi).toHaveBeenCalledWith({
        datasetQuery: {
          type: "query",
          database: 1,
          query: {
            "source-table": 1,
            aggregation: [
              ["metric", 34],
              [
                "aggregation-options",
                ["measure", 21],
                { "display-name": "Measure 21" },
              ],
            ],
          },
          parameters: [],
        },
      });
    });
  });

  it("queries generated source-card metrics through the dataset endpoint", async () => {
    const queryDatasetApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryDataset = jest.fn(() => queryDatasetApi);

    setup({
      queryDataset,
      component: <SourceCardMetricComponent />,
    });

    await waitFor(() => {
      expect(queryDatasetApi).toHaveBeenCalledWith({
        datasetQuery: {
          type: "query",
          database: 1,
          query: {
            "source-table": "card__98",
            aggregation: [["metric", 36]],
          },
          parameters: [],
        },
      });
    });
  });

  it("queries generated metric table-field filters through the dataset endpoint", async () => {
    const queryDatasetApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryDataset = jest.fn(() => queryDatasetApi);

    setup({
      queryDataset,
      component: <MetricTableFieldFilterComponent />,
    });

    await waitFor(() => {
      expect(queryDatasetApi).toHaveBeenCalledWith({
        datasetQuery: {
          type: "query",
          database: 1,
          query: {
            "source-table": 1,
            aggregation: [["metric", 34]],
            filter: ["=", ["field", 101, {}], "paid"],
          },
          parameters: [],
        },
      });
    });
  });

  it("queries metrics with measures grouped by mapped table-field breakouts", async () => {
    const queryDatasetApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryDataset = jest.fn(() => queryDatasetApi);

    setup({
      queryDataset,
      component: <MetricMappedTableBreakoutComponent />,
    });

    await waitFor(() => {
      expect(queryDatasetApi).toHaveBeenCalledWith({
        datasetQuery: {
          type: "query",
          database: 1,
          query: {
            "source-table": 1,
            aggregation: [
              ["metric", 35],
              [
                "aggregation-options",
                ["measure", 21],
                { "display-name": "Measure 21" },
              ],
            ],
            breakout: [["field", 103, { "temporal-unit": "month" }]],
          },
          parameters: [],
        },
      });
    });
  });

  it("keeps generated metric query objects on the dataset query path", () => {
    render(<MetricQueryObjectComponent />);

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["metric", 34]],
        breakout: [["field", 101, {}]],
      },
      parameters: [],
    });
  });

  it("builds generated source-card metric query objects on the dataset query path", () => {
    render(<SourceCardMetricQueryObjectComponent />);

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": "card__98",
        aggregation: [["metric", 36]],
        breakout: [["field", 103, { "temporal-unit": "month" }]],
      },
      parameters: [],
    });
  });

  it("raises a runtime error when metric table-field filters are not valid dimensions", async () => {
    const queryDataset = jest.fn();

    setup({
      queryDataset,
      component: <InvalidMetricDimensionFilterComponent />,
    });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Metric query table-field filters must match a generated metric dimension",
      );
    });

    expect(queryDataset).not.toHaveBeenCalled();
  });
});

const TestComponent = () => {
  const query = {
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [TEST_SCHEMA.tables.products.segments.active],
  };

  const result = useMetabaseQuery(query as never);

  return (
    <div data-testid="error">
      {result.error instanceof Error ? result.error.message : ""}
    </div>
  );
};

const InvalidTableMeasureComponent = () => {
  const query = {
    table: TEST_SCHEMA.tables.orders,
    measures: [{ name: "count" }],
  };

  const result = useMetabaseQuery(query as never);

  return (
    <div data-testid="error">
      {result.error instanceof Error ? result.error.message : ""}
    </div>
  );
};

const MetabaseQueryObjectComponent = () => {
  const query = useMetabaseQueryObject({
    table: TEST_SCHEMA.tables.orders,
    filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
    breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.createdAt)],
  });

  return <div data-testid="query-object">{JSON.stringify(query)}</div>;
};

const MetricQueryObjectComponent = () => {
  const query = useMetabaseQueryObject({
    metric: TEST_SCHEMA.metrics.orderCount,
    breakouts: [
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.status),
    ],
  });

  return <div data-testid="query-object">{JSON.stringify(query)}</div>;
};

const SourceCardMetricQueryObjectComponent = () => {
  const query = useMetabaseQueryObject({
    metric: TEST_SCHEMA.metrics.orderCountFromModel,
    breakouts: [
      breakout(
        TEST_SCHEMA.metrics.orderCountFromModel.dimensions.orders.createdAt,
        { bucket: "month" },
      ),
    ],
  });

  return <div data-testid="query-object">{JSON.stringify(query)}</div>;
};

const TableFieldIdComponent = () => {
  useMetabaseQuery<OrdersTable>({
    table: TEST_SCHEMA.tables.orders,
    filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
    breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
  });

  return null;
};

const TableObjectComponent = () => {
  useMetabaseQuery({
    table: TEST_SCHEMA.tables.orders,
    filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
  });

  return null;
};

const MetricMeasuresComponent = () => {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    measures: [TEST_SCHEMA.tables.orders.measures.revenue],
  });

  return null;
};

const SourceCardMetricComponent = () => {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCountFromModel,
  });

  return null;
};

const MetricTableFieldFilterComponent = () => {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      filter(
        TEST_SCHEMA.metrics.orderCount.dimensions.orders.status,
        "=",
        "paid",
      ),
    ],
  });

  return null;
};

const MetricMappedTableBreakoutComponent = () => {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderValue,
    measures: [TEST_SCHEMA.tables.orders.measures.revenue],
    breakouts: [
      breakout(TEST_SCHEMA.metrics.orderValue.dimensions.orders.createdAt, {
        bucket: "month",
      }),
    ],
  });

  return null;
};

const InvalidMetricDimensionFilterComponent = () => {
  const result = useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      filter(TEST_SCHEMA.tables.orders.fields.internalCode, "=", "hidden"),
    ],
  } as never);

  return (
    <div data-testid="error">
      {result.error instanceof Error ? result.error.message : ""}
    </div>
  );
};

function setup({
  queryDataset,
  component = <TestComponent />,
}: {
  queryDataset?: jest.Mock;
  component?: JSX.Element;
}) {
  const { state } = setupSdkState();

  renderWithSDKProviders(component, {
    metabaseEmbeddingSdkBundleExports: {
      createMetabaseQuery: createMetabaseQueryInBundle,
      getLoginStatus,
      queryDataset,
    },
    storeInitialState: state,
    componentProviderProps: {
      authConfig: createMockSdkConfig(),
    },
  });
}
