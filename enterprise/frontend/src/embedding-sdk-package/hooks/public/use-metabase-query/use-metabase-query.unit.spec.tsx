import { renderHook, waitFor } from "@testing-library/react";

import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "metabase/embedding-sdk/lib/create-metabase-query";
import type { MetabaseCard } from "metabase/embedding-sdk/types/question";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import type { DatasetQuery } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import * as DataApp from "../../../data-app";

import type {
  MetabaseQueryOptions,
  UseMetabaseQueryObjectResult,
} from "./use-metabase-query";
import {
  breakout,
  count,
  filter,
  sum,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "./use-metabase-query";

jest.mock("embedding-sdk-shared/hooks/use-lazy-selector", () => ({
  useLazySelector: jest.fn(() => ({ status: "success" })),
}));

jest.mock(
  "embedding-sdk-shared/hooks/use-metabase-provider-props-store",
  () => ({
    useMetabaseProviderPropsStore: jest.fn(),
  }),
);

jest.mock("embedding-sdk-shared/hooks/use-sdk-loading-state", () => ({
  useSdkLoadingState: jest.fn(() => ({ loadingState: "loaded" })),
}));

jest.mock("metabase/api", () => ({
  cardApi: {
    endpoints: {
      getCard: { name: "getCard" },
      getCardQueryMetadata: { name: "getCardQueryMetadata" },
    },
  },
}));

jest.mock("metabase/api/utils/run-rtk-endpoint", () => ({
  runRtkEndpoint: jest.fn(() => Promise.resolve(undefined)),
}));

jest.mock("metabase/redux/tables", () => ({
  fetchTableMetadata: jest.fn(({ id }) => ({
    type: "fetchTableMetadata",
    payload: id,
  })),
}));

jest.mock("metabase/selectors/metadata", () => ({
  getMetadataUnfiltered: jest.fn(),
}));

const mockFetchTableMetadata = jest.mocked(fetchTableMetadata);
const mockGetMetadataUnfiltered = jest.mocked(getMetadataUnfiltered);
const mockRunRtkEndpoint = jest.mocked(runRtkEndpoint);
const mockUseLazySelector = jest.mocked(useLazySelector);
const mockUseMetabaseProviderPropsStore = jest.mocked(
  useMetabaseProviderPropsStore,
);
const mockUseSdkLoadingState = jest.mocked(useSdkLoadingState);

const TEST_SCHEMA = {
  tables: {
    orders: {
      type: "table",
      id: 1,
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
  metrics: {
    revenue: {
      type: "metric",
      id: 31,
      name: "Revenue",
      databaseId: 1,
      sourceTableId: 1,
      mappedTableIds: [1],
      columns: [{ name: "Revenue", displayName: "Revenue", jsType: "number" }],
      dimensions: {
        orders: {
          amount: {
            type: "column",
            fieldId: 102,
            tableId: 1,
            name: "AMOUNT",
            displayName: "Amount",
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
          status: {
            type: "column",
            fieldId: 101,
            tableId: 1,
            name: "STATUS",
            displayName: "Status",
            jsType: "string",
          },
        },
      },
    },
  },
} as const;

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];
type RevenueMetric = (typeof TEST_SCHEMA)["metrics"]["revenue"];

const TEST_METADATA = {
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
    100: {
      id: 100,
      table_id: 1,
      name: "ID",
      display_name: "ID",
      base_type: "type/Integer",
      effective_type: "type/Integer",
    },
    101: {
      id: 101,
      table_id: 1,
      name: "STATUS",
      display_name: "Status",
      base_type: "type/Text",
      effective_type: "type/Text",
    },
    102: {
      id: 102,
      table_id: 1,
      name: "AMOUNT",
      display_name: "Amount",
      base_type: "type/Float",
      effective_type: "type/Float",
    },
    103: {
      id: 103,
      table_id: 1,
      name: "CREATED_AT",
      display_name: "Created At",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
    },
    201: {
      id: 201,
      table_id: 2,
      name: "PRICE",
      display_name: "Price",
      base_type: "type/Float",
      effective_type: "type/Float",
    },
  },
  segments: {
    11: { id: 11, table_id: 1, name: "Completed" },
    12: { id: 12, table_id: 2, name: "Active" },
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
    22: {
      id: 22,
      name: "Price",
      table_id: 2,
      definition: {
        type: "query",
        database: 1,
        query: {
          "source-table": 2,
          aggregation: [["count"]],
        },
      },
    },
  },
  questions: {
    31: createMockCard({
      id: 31,
      name: "Revenue",
      type: "metric",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
        },
      },
    }),
  },
};

const createMockStore = () =>
  ({
    dispatch: jest.fn((action) => Promise.resolve(action)),
    getState: jest.fn(() => ({})),
  }) as any;

const TEST_DATASET_QUERY = {
  "lib/type": "mbql/query",
  database: 1,
  stages: [{ "source-table": 1 }],
} as unknown as DatasetQuery;

function createDeferred<TValue>() {
  let resolve!: (value: TValue) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

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

const _validMetricQuery = {
  source: TEST_SCHEMA.metrics.revenue,
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.metrics.revenue.dimensions.orders.status, "=", "paid"),
  ],
  aggregations: [
    TEST_SCHEMA.tables.orders.measures.revenue,
    sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
      unit: "month",
    }),
  ],
  limit: 100,
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validCardQuery = {
  query: {
    "lib/type": "mbql/query",
    database: 1,
    stages: [],
  },
} satisfies MetabaseCard;

const hookResult = {} as UseMetabaseQueryObjectResult;
const _validHookResultCard = {
  query: hookResult.query,
} satisfies MetabaseCard;

const _invalidHookResultCard = {
  // @ts-expect-error pass useMetabaseQueryObject(...).query, not the whole hook result
  query: hookResult,
} satisfies MetabaseCard;

const _invalidMetricCrossTableSegmentQuery = {
  source: TEST_SCHEMA.metrics.revenue,
  filters: [
    // @ts-expect-error segments must belong to a mapped metric table
    TEST_SCHEMA.tables.products.segments.active,
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

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

  const metricResult = useMetabaseQuery<RevenueMetric>({
    source: TEST_SCHEMA.metrics.revenue,
    aggregations: [sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount)],
  });

  const metricAggregationValue: number | null | undefined =
    metricResult.data?.rows[0]?.sum;

  void metricAggregationValue;

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

describe("resolveDatasetQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunRtkEndpoint.mockResolvedValue(undefined);
    mockGetMetadataUnfiltered.mockReturnValue(TEST_METADATA as any);
    mockUseLazySelector.mockReturnValue({ status: "success" });
    mockUseSdkLoadingState.mockReturnValue({ loadingState: "loaded" } as any);
    mockUseMetabaseProviderPropsStore.mockReturnValue({
      state: {
        internalProps: {
          reduxStore: createMockStore(),
        },
      },
    } as any);
    (window as any).METABASE_EMBEDDING_SDK_BUNDLE = undefined;
  });

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
      filter: expect.any(Function),
      useMetabaseQuery: expect.any(Function),
      useMetabaseQueryObject: expect.any(Function),
    });
    expect(DataApp).not.toHaveProperty("count");
    expect(DataApp).not.toHaveProperty("sum");
    expect(DataApp).not.toHaveProperty("resolveDatasetQuery");
  });

  it("loads table metadata and passes the public source DSL through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
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

    expect(mockFetchTableMetadata).toHaveBeenCalledWith({ id: 1 });

    expect(store.dispatch).toHaveBeenCalledWith({
      type: "fetchTableMetadata",
      payload: 1,
    });

    expect(mockGetMetadataUnfiltered).toHaveBeenCalledWith({});

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

  it("passes generated table Measures to Lib.createTestQuery measure aggregations", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
    });

    expect(
      (datasetQuery as DatasetQuery & { stages: any[] }).stages[0].aggregation,
    ).toEqual([["measure", expect.anything(), 21]]);
  });

  it("accepts id-only table source references", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: { type: "table", id: 1 },
      fields: [TEST_SCHEMA.tables.orders.fields.id],
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [
        {
          "source-table": 1,
          fields: [["field", expect.anything(), 100]],
        },
      ],
    });
  });

  it("loads metric metadata and passes the public source DSL through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
      source: TEST_SCHEMA.metrics.revenue,
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(
          TEST_SCHEMA.metrics.revenue.dimensions.orders.status,
          "=",
          "paid",
        ),
      ],
      aggregations: [
        count(),
        sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
        TEST_SCHEMA.tables.orders.measures.revenue,
      ],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
          unit: "month",
        }),
      ],
      limit: 100,
    });

    expect(mockFetchTableMetadata).not.toHaveBeenCalled();

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      1,
      { id: 31 },
      store.dispatch,
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    );

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      2,
      31,
      store.dispatch,
      cardApi.endpoints.getCardQueryMetadata,
      { forceRefetch: false },
    );

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          filters: [
            ["segment", expect.anything(), 11],
            ["=", expect.anything(), ["field", expect.anything(), 101], "paid"],
          ],
          aggregation: [
            ["metric", expect.anything(), 31],
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), 102]],
            ["measure", expect.anything(), 21],
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

  it("rejects invalid limits with a clear error message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        limit: 0,
      }),
    ).rejects.toThrow("Table query limit must be a positive integer.");
  });

  it("rejects cross-table query clauses with clear error messages", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        fields: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).rejects.toThrow(
      "Table query fields must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        filters: [filter(TEST_SCHEMA.tables.products.fields.price, "=", 10)],
      }),
    ).rejects.toThrow(
      "Table query filters must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [sum(TEST_SCHEMA.tables.products.fields.price)],
      }),
    ).rejects.toThrow(
      "Table query aggregations must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        breakouts: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).rejects.toThrow(
      "Table query breakouts must belong to source table 1, but received table id 2.",
    );
  });

  it("rejects invalid metric query clauses with clear error messages", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.metrics.revenue,
        filters: [TEST_SCHEMA.tables.products.segments.active],
      }),
    ).rejects.toThrow(
      "Metric query filters must belong to one of the Metric's mapped tables. Expected table id 2 to be one of 1.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.metrics.revenue,
        filters: [filter(TEST_SCHEMA.tables.products.fields.price, "=", 10)],
      }),
    ).rejects.toThrow(
      "Metric query filters must use generated metric dimensions.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.metrics.revenue,
        aggregations: [sum(TEST_SCHEMA.tables.products.fields.price)],
      }),
    ).rejects.toThrow(
      "Metric query aggregations must use generated metric dimensions.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.metrics.revenue,
        breakouts: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).rejects.toThrow(
      "Metric query breakouts must use generated metric dimensions.",
    );
  });
});

describe("useMetabaseQueryObject", () => {
  const query = {
    source: TEST_SCHEMA.tables.orders,
    limit: 10,
  };

  it("returns a loading state until async query creation resolves", async () => {
    const deferred = createDeferred<DatasetQuery>();
    const resolveDatasetQuery = jest.fn(() => jest.fn(() => deferred.promise));
    (window as any).METABASE_EMBEDDING_SDK_BUNDLE = {
      resolveDatasetQuery,
    };

    const { result } = renderHook(() => useMetabaseQueryObject(query));

    expect(result.current).toEqual({
      query: null,
      error: null,
      isLoading: true,
    });

    deferred.resolve(TEST_DATASET_QUERY);

    await waitFor(() =>
      expect(result.current).toEqual({
        query: TEST_DATASET_QUERY,
        error: null,
        isLoading: false,
      }),
    );
  });

  it("returns query creation errors instead of swallowing them", async () => {
    const error = new Error("No column found");
    const resolveDatasetQuery = jest.fn(() =>
      jest.fn(() => Promise.reject(error)),
    );
    (window as any).METABASE_EMBEDDING_SDK_BUNDLE = {
      resolveDatasetQuery,
    };

    const { result } = renderHook(() => useMetabaseQueryObject(query));

    await waitFor(() =>
      expect(result.current).toEqual({
        query: null,
        error,
        isLoading: false,
      }),
    );
  });

  it("waits for login before resolving the query", async () => {
    const resolveDatasetQuery = jest.fn(() =>
      jest.fn(() => Promise.resolve(TEST_DATASET_QUERY)),
    );
    (window as any).METABASE_EMBEDDING_SDK_BUNDLE = {
      resolveDatasetQuery,
    };
    mockUseLazySelector.mockReturnValue({ status: "loading" });

    const { result, rerender } = renderHook(() =>
      useMetabaseQueryObject(query),
    );

    expect(result.current).toEqual({
      query: null,
      error: null,
      isLoading: true,
    });
    expect(resolveDatasetQuery).not.toHaveBeenCalled();

    mockUseLazySelector.mockReturnValue({ status: "success" });
    rerender();

    await waitFor(() => {
      expect(resolveDatasetQuery).toHaveBeenCalled();
      expect(result.current).toEqual({
        query: TEST_DATASET_QUERY,
        error: null,
        isLoading: false,
      });
    });
  });

  it("does not expose stale query results after the input changes", async () => {
    const firstDeferred = createDeferred<DatasetQuery>();
    const secondDeferred = createDeferred<DatasetQuery>();
    const firstQuery = {
      source: TEST_SCHEMA.tables.orders,
      limit: 10,
    };
    const secondQuery = {
      source: TEST_SCHEMA.tables.orders,
      limit: 20,
    };
    const secondDatasetQuery = {
      ...TEST_DATASET_QUERY,
      stages: [{ "source-table": 1, limit: 20 }],
    } as unknown as DatasetQuery;
    const resolveDatasetQuery = jest.fn(
      () => (input: typeof firstQuery | typeof secondQuery) =>
        input.limit === 10 ? firstDeferred.promise : secondDeferred.promise,
    );
    (window as any).METABASE_EMBEDDING_SDK_BUNDLE = {
      resolveDatasetQuery,
    };

    const { result, rerender } = renderHook(
      ({ currentQuery }) => useMetabaseQueryObject(currentQuery),
      { initialProps: { currentQuery: firstQuery } },
    );

    rerender({ currentQuery: secondQuery });
    firstDeferred.resolve(TEST_DATASET_QUERY);

    expect(result.current).toEqual({
      query: null,
      error: null,
      isLoading: true,
    });

    secondDeferred.resolve(secondDatasetQuery);

    await waitFor(() =>
      expect(result.current).toEqual({
        query: secondDatasetQuery,
        error: null,
        isLoading: false,
      }),
    );
  });
});

describe("useMetabaseQuery", () => {
  it("waits for async query creation before querying the dataset", async () => {
    const deferred = createDeferred<DatasetQuery>();
    const queryDataset = jest.fn(() =>
      Promise.resolve({
        rowCount: 1,
        runningTime: 1,
        columns: [],
        rows: [],
      }),
    );
    (window as any).METABASE_EMBEDDING_SDK_BUNDLE = {
      resolveDatasetQuery: jest.fn(() => jest.fn(() => deferred.promise)),
      queryDataset: jest.fn(() => queryDataset),
    };

    renderHook(() =>
      useMetabaseQuery({
        source: TEST_SCHEMA.tables.orders,
        limit: 10,
      }),
    );

    expect(queryDataset).not.toHaveBeenCalled();

    deferred.resolve(TEST_DATASET_QUERY);

    await waitFor(() =>
      expect(queryDataset).toHaveBeenCalledWith({
        datasetQuery: TEST_DATASET_QUERY,
      }),
    );
  });
});
