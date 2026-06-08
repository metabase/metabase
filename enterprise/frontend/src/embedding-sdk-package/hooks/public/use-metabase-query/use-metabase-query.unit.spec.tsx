import { waitFor } from "@testing-library/react";

import { screen } from "__support__/ui";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";

import type { MetabaseQueryOptions } from "./use-metabase-query";
import { useMetabaseQuery } from "./use-metabase-query";

const TEST_SCHEMA = {
  tables: {
    orders: {
      id: 1,
      databaseId: 1,
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
      mappedTableIds: [1],
    },
  },
} as const;

type TestSchema = typeof TEST_SCHEMA;
type OrderCountMetric = TestSchema["metrics"]["orderCount"];

const _validMetricScopedQuery = {
  metricId: TEST_SCHEMA.metrics.orderCount.id,
  filters: [TEST_SCHEMA.tables.orders.segments.completed],
  measures: [TEST_SCHEMA.tables.orders.measures.revenue],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _validMetricObjectQuery = {
  metric: TEST_SCHEMA.metrics.orderCount,
  filters: [TEST_SCHEMA.tables.orders.segments.completed],
  measures: [TEST_SCHEMA.tables.orders.measures.revenue],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricSegmentQuery = {
  metricId: TEST_SCHEMA.metrics.orderCount.id,
  // @ts-expect-error segments must belong to the metric's mapped tables
  filters: [TEST_SCHEMA.tables.products.segments.active],
} satisfies MetabaseQueryOptions<OrderCountMetric, TestSchema>;

const _invalidMetricMeasureQuery = {
  metricId: TEST_SCHEMA.metrics.orderCount.id,
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

function setup({ queryMetric }: { queryMetric: jest.Mock }) {
  const { state } = setupSdkState();

  renderWithSDKProviders(<TestComponent />, {
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
