import { waitFor } from "@testing-library/react";

import { screen } from "__support__/ui";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";

import type { MetabaseQueryOptions } from "./use-metabase-query";
import { breakout, filter, useMetabaseQuery } from "./use-metabase-query";

const TEST_SCHEMA = {
  tables: {
    orders: {
      id: 1,
      databaseId: 1,
      fields: {
        createdAt: {
          id: 103,
          fieldId: 103,
          name: "created_at",
          displayName: "Created At",
          jsType: "Date",
        },
        amount: {
          id: 102,
          fieldId: 102,
          name: "amount",
          displayName: "Amount",
          jsType: "number",
        },
        status: {
          id: 101,
          fieldId: 101,
          name: "status",
          displayName: "Status",
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
          id: 201,
          fieldId: 201,
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
  },
  metrics: {
    orderCount: {
      id: 34,
      columns: [{ name: "count", displayName: "Count", jsType: "number" }],
      dimensions: {
        createdAt: {
          id: "metric-created-at",
          fieldId: 103,
          tableId: 1,
          name: "created_at",
          displayName: "Created At",
          jsType: "Date",
        },
        status: {
          id: "metric-status",
          fieldId: 101,
          tableId: 1,
          name: "status",
          displayName: "Status",
          jsType: "string",
        },
        amount: {
          id: "metric-amount",
          fieldId: 102,
          tableId: 1,
          name: "amount",
          displayName: "Amount",
          jsType: "number",
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
  tableId: TEST_SCHEMA.tables.orders.id,
  filters: [
    filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
    filter(TEST_SCHEMA.tables.orders.fields.amount, ">", 10),
    filter(TEST_SCHEMA.tables.orders.fields.amount, "between", [10, 20]),
    filter(TEST_SCHEMA.tables.orders.fields.status, "not-empty"),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableCustomFilterObjectQuery = {
  tableId: TEST_SCHEMA.tables.orders.id,
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
  tableId: TEST_SCHEMA.tables.orders.id,
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

const _invalidTableBreakoutUnknownBucketQuery = {
  tableId: TEST_SCHEMA.tables.orders.id,
  breakouts: [
    breakout(TEST_SCHEMA.tables.orders.fields.createdAt, {
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      bucket: "aaaa",
    }),
    {
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      dimension: TEST_SCHEMA.tables.orders.fields.createdAt,
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      bucket: "aaaa",
    },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableBreakoutNonDateBucketQuery = {
  tableId: TEST_SCHEMA.tables.orders.id,
  breakouts: [
    // @ts-expect-error non-date dimensions do not support temporal buckets
    breakout(TEST_SCHEMA.tables.orders.fields.status, { bucket: "month" }),
    // @ts-expect-error non-date dimensions do not support temporal buckets
    {
      dimension: TEST_SCHEMA.tables.orders.fields.status,
      bucket: "month",
    },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableCustomFilterOperatorQuery = {
  tableId: TEST_SCHEMA.tables.orders.id,
  filters: [
    // @ts-expect-error number dimensions do not support string operators
    filter(TEST_SCHEMA.tables.orders.fields.amount, "contains", "10"),
    // @ts-expect-error string dimensions do not support numeric comparison operators
    filter(TEST_SCHEMA.tables.orders.fields.status, ">", "paid"),
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidTableCustomFilterQuery = {
  tableId: TEST_SCHEMA.tables.orders.id,
  filters: [
    {
      // @ts-expect-error custom filter dimensions must belong to the table schema
      dimension: TEST_SCHEMA.tables.products.fields.price,
      operator: "=",
      value: 10,
    },
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
      dimension: TEST_SCHEMA.metrics.orderCount.dimensions.createdAt,
      bucket: "month",
    },
  ],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricBreakoutUnknownBucketQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  breakouts: [
    {
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      dimension: TEST_SCHEMA.metrics.orderCount.dimensions.createdAt,
      // @ts-expect-error temporal buckets must be valid Metabase temporal units
      bucket: "aaaa",
    },
  ],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricBreakoutNonDateBucketQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  breakouts: [
    // @ts-expect-error non-date dimensions do not support temporal buckets
    {
      dimension: TEST_SCHEMA.metrics.orderCount.dimensions.status,
      bucket: "month",
    },
  ],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

function useMetricBreakoutTypeFixtures() {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    breakouts: [
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.createdAt, {
        bucket: "month",
      }),
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.amount, {
        binning: { strategy: "num-bins", "num-bins": 10 },
      }),
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.status),
      {
        dimension: TEST_SCHEMA.metrics.orderCount.dimensions.createdAt,
        bucket: "month",
      },
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    breakouts: [
      // @ts-expect-error non-date metric dimensions do not support temporal buckets
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.status, {
        bucket: "month",
      }),
      // @ts-expect-error non-date metric dimensions do not support temporal buckets
      {
        dimension: TEST_SCHEMA.metrics.orderCount.dimensions.status,
        bucket: "month",
      },
    ],
  });
}

void useMetricBreakoutTypeFixtures;

function useMetricFilterOperatorTypeFixtures() {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      filter(
        TEST_SCHEMA.metrics.orderCount.dimensions.status,
        "contains",
        "paid",
      ),
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      {
        dimension: TEST_SCHEMA.metrics.orderCount.dimensions.status,
        operator: "contains",
        value: "paid",
      },
    ],
  });

  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [
      // @ts-expect-error string metric dimensions do not support numeric comparison operators
      filter(TEST_SCHEMA.metrics.orderCount.dimensions.status, ">", "paid"),
    ],
  });
}

void useMetricFilterOperatorTypeFixtures;

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

describe("useMetabaseQuery", () => {
  it("raises a runtime error when metric segments are not from mapped tables", async () => {
    const queryMetric = jest.fn();

    setup({ queryMetric });

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Metric query segments must belong to one of the query's mapped tables.",
      );
    });

    expect(queryMetric).not.toHaveBeenCalled();
  });

  it("queries metrics with measures via the metric dataset endpoint", async () => {
    const queryMetricApi = jest.fn().mockResolvedValue({
      rowCount: null,
      runningTime: null,
      columns: [],
      rows: [],
    });
    const queryMetric = jest.fn(() => queryMetricApi);

    setup({ queryMetric, component: <MetricMeasuresComponent /> });

    await waitFor(() => {
      expect(queryMetricApi).toHaveBeenCalledWith({
        definition: {
          expression: ["metric", { "lib/uuid": "metric" }, 34],
          measures: [21],
        },
      });
    });
  });
});

const TestComponent = () => {
  const query = {
    metric: TEST_SCHEMA.metrics.orderCount,
    filters: [TEST_SCHEMA.tables.products.segments.active],
  } as unknown as MetabaseQueryOptions;

  const result = useMetabaseQuery(query);

  return (
    <div data-testid="error">
      {result.error instanceof Error ? result.error.message : ""}
    </div>
  );
};

const MetricMeasuresComponent = () => {
  useMetabaseQuery({
    metric: TEST_SCHEMA.metrics.orderCount,
    measures: [TEST_SCHEMA.tables.orders.measures.revenue],
  });

  return null;
};

function setup({
  queryMetric,
  component = <TestComponent />,
}: {
  queryMetric: jest.Mock;
  component?: JSX.Element;
}) {
  const { state } = setupSdkState();

  renderWithSDKProviders(component, {
    metabaseEmbeddingSdkBundleExports: {
      getLoginStatus,
      queryMetric,
    },
    storeInitialState: state,
    componentProviderProps: {
      authConfig: createMockSdkConfig(),
    },
  });
}
