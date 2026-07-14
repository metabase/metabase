import { renderHook, waitFor } from "@testing-library/react";

import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { useLazySelector } from "embedding-sdk-package/hooks/private/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import type { QueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { MetabaseCard } from "metabase/embedding-sdk/types/question";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import type { DatasetQuery } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import * as DataApp from "../../../data-app";
import type { RowValue } from "../data-schema";

import type { MetabaseQueryOptions, UseMetabaseQueryObjectResult } from ".";
import {
  avg,
  breakout,
  count,
  filter,
  orderBy,
  sum,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from ".";

jest.mock("embedding-sdk-package/hooks/private/use-lazy-selector", () => ({
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
          "source-name": "orders",
          displayName: "ID",
          jsType: "number",
        },
        createdAt: {
          type: "column",
          fieldId: 103,
          tableId: 1,
          name: "CREATED_AT",
          "source-name": "orders",
          displayName: "Created At",
          jsType: "Date",
          baseType: "type/DateTime",
        },
        amount: {
          type: "column",
          fieldId: 102,
          tableId: 1,
          name: "AMOUNT",
          "source-name": "orders",
          displayName: "Amount",
          jsType: "number",
        },
        status: {
          type: "column",
          fieldId: 101,
          tableId: 1,
          name: "STATUS",
          "source-name": "orders",
          displayName: "Status",
          jsType: "string",
        },
        productId: {
          type: "column",
          fieldId: 104,
          tableId: 1,
          name: "PRODUCT_ID",
          displayName: "Product ID",
          jsType: "number",
        },
        replacementProductId: {
          type: "column",
          fieldId: 105,
          tableId: 1,
          name: "REPLACEMENT_PRODUCT_ID",
          displayName: "Replacement Product ID",
          jsType: "number",
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
          "source-name": "products",
          displayName: "Price",
          jsType: "number",
        },
        name: {
          type: "column",
          fieldId: 202,
          tableId: 2,
          name: "NAME",
          displayName: "Name",
          jsType: "string",
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
      mappedTableIds: [1, 2],
      columns: [{ name: "sum", displayName: "Revenue", jsType: "number" }],
      dimensions: {
        orders: {
          amount: {
            type: "column",
            fieldId: 102,
            tableId: 1,
            name: "AMOUNT",
            "source-name": "orders",
            displayName: "Amount",
            jsType: "number",
          },
          createdAt: {
            type: "column",
            fieldId: 103,
            tableId: 1,
            name: "CREATED_AT",
            "source-name": "orders",
            displayName: "Created At",
            jsType: "Date",
            baseType: "type/DateTime",
          },
          status: {
            type: "column",
            fieldId: 101,
            tableId: 1,
            name: "STATUS",
            "source-name": "orders",
            displayName: "Status",
            jsType: "string",
          },
          product: {
            type: "column",
            fieldId: 202,
            sourceFieldId: 104,
            name: "NAME",
            displayName: "Name",
            jsType: "string",
          },
        },
      },
    },
    sourceCardMetric: {
      type: "metric",
      id: 32,
      name: "Stores with over 5 employees",
      databaseId: 1,
      sourceCardId: 1,
      mappedTableIds: [1],
      columns: [{ name: "count", displayName: "Count", jsType: "number" }],
      dimensions: {
        fields: {
          count: {
            type: "column",
            name: "count",
            displayName: "Count",
            jsType: "number",
          },
        },
        orders: {
          status: {
            type: "column",
            fieldId: 101,
            tableId: 1,
            name: "STATUS",
            "source-name": "orders",
            displayName: "Status",
            jsType: "string",
          },
          product: {
            type: "column",
            fieldId: 202,
            sourceFieldId: 104,
            name: "NAME",
            displayName: "Name",
            jsType: "string",
          },
        },
      },
    },
    productRevenue: {
      type: "metric",
      id: 32,
      name: "Product Revenue",
      databaseId: 1,
      sourceTableId: 2,
      mappedTableIds: [2],
      columns: [
        {
          name: "Product Revenue",
          displayName: "Product Revenue",
          jsType: "number",
        },
      ],
      dimensions: {
        products: {
          price: {
            type: "column",
            fieldId: 201,
            tableId: 2,
            name: "PRICE",
            displayName: "Price",
            jsType: "number",
          },
        },
      },
    },
    questionRevenue: {
      type: "metric",
      id: 33,
      name: "Question Revenue",
      databaseId: 1,
      sourceCardId: 41,
      mappedTableIds: [1],
      columns: [
        {
          name: "Question Revenue",
          displayName: "Question Revenue",
          jsType: "number",
        },
      ],
      dimensions: {
        orders: {
          createdAt: {
            type: "column",
            fieldId: 103,
            tableId: 1,
            name: "CREATED_AT",
            displayName: "Created At",
            jsType: "Date",
            baseType: "type/DateTime",
          },
        },
      },
    },
  },
  questions: {
    ordersQuestion: {
      type: "card",
      id: 41,
      name: "Orders question",
      columns: [
        {
          type: "column",
          name: "STATUS",
          displayName: "Status",
          jsType: "string",
        },
        {
          type: "column",
          name: "AMOUNT",
          displayName: "Amount",
          jsType: "number",
        },
        {
          type: "column",
          name: "CREATED_AT",
          displayName: "Created At",
          jsType: "Date",
        },
      ],
    },
  },
} as const;

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];
type OrdersQuestion = (typeof TEST_SCHEMA)["questions"]["ordersQuestion"];

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
    104: {
      id: 104,
      table_id: 1,
      name: "PRODUCT_ID",
      display_name: "Product ID",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      semantic_type: "type/FK",
      fk_target_field_id: 200,
    },
    105: {
      id: 105,
      table_id: 1,
      name: "REPLACEMENT_PRODUCT_ID",
      display_name: "Replacement Product ID",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      semantic_type: "type/FK",
      fk_target_field_id: 200,
    },
    200: {
      id: 200,
      table_id: 2,
      name: "ID",
      display_name: "ID",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      semantic_type: "type/PK",
    },
    201: {
      id: 201,
      table_id: 2,
      name: "PRICE",
      display_name: "Price",
      base_type: "type/Float",
      effective_type: "type/Float",
    },
    202: {
      id: 202,
      table_id: 2,
      name: "NAME",
      display_name: "Name",
      base_type: "type/Text",
      effective_type: "type/Text",
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
    41: createMockCard({
      id: 41,
      name: "Orders question",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
        },
      },
    }),
    31: createMockCard({
      id: 31,
      name: "Revenue",
      type: "metric",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["sum", ["field", 102, null]]],
        },
      },
    }),
    32: createMockCard({
      id: 32,
      name: "Product Revenue",
      type: "metric",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": 2,
          aggregation: [["sum", ["field", 201, null]]],
        },
      },
    }),
  },
};

const createMockStore = (): SdkStore =>
  // A real `getSdkStore()` pulls in reducers this spec's `metabase/api` mock can't
  // satisfy; only `dispatch` and `getState` are reached, and both land in mocks.
  ({
    dispatch: jest.fn((action) => Promise.resolve(action)),
    getState: jest.fn(() => ({})),
  }) as unknown as SdkStore;

type MbqlStage = Record<string, unknown>;

const mbqlQuery = (stages: MbqlStage[]): DatasetQuery =>
  // `DatasetQuery` is opaque, so one can't be written as a literal.
  ({
    "lib/type": "mbql/query",
    database: 1,
    stages,
  }) as unknown as DatasetQuery;

const stagesOf = (query: DatasetQuery): MbqlStage[] =>
  // ...nor its stages read.
  (query as unknown as { stages: MbqlStage[] }).stages;

const TEST_DATASET_QUERY = mbqlQuery([{ "source-table": 1 }]);

const mockPropsStore = (reduxStore: SdkStore) =>
  mockUseMetabaseProviderPropsStore.mockReturnValue({
    state: { internalProps: { reduxStore }, props: null },
    store: ensureMetabaseProviderPropsStore(),
  });

const stubSdkBundle = (
  exports: Partial<MetabaseEmbeddingSdkBundleExports>,
): void => {
  window.METABASE_EMBEDDING_SDK_BUNDLE =
    // The global is typed as the whole bundle; a test needs one or two functions.
    exports as MetabaseEmbeddingSdkBundleExports;
};

const LOADED_SDK_STATE: ReturnType<typeof useSdkLoadingState> = {
  loadingState: SdkLoadingState.Loaded,
  loadingError: null,
  isInitial: false,
  isLoading: false,
  isLoaded: true,
  isInitialized: false,
  isError: false,
  isNotStartedLoading: false,
};

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
  orderBys: [
    orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, "desc", {
      unit: "month",
    }),
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

const _validTableQueryWithMetricAggregation = {
  source: TEST_SCHEMA.tables.orders,
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.metrics.revenue.dimensions.orders.status, "=", "paid"),
  ],
  aggregations: [
    TEST_SCHEMA.metrics.revenue,
    TEST_SCHEMA.tables.orders.measures.revenue,
    sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
      unit: "month",
    }),
  ],
  orderBys: [
    orderBy(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, "desc", {
      unit: "month",
    }),
  ],
  limit: 100,
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableQueryWithJoinedMetricBreakout = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [TEST_SCHEMA.metrics.revenue],
  breakouts: [breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.product)],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validSavedQuestionQuery = {
  source: TEST_SCHEMA.questions.ordersQuestion,
} satisfies MetabaseQueryOptions<OrdersQuestion>;

const _invalidSavedQuestionClauseQuery = {
  source: TEST_SCHEMA.questions.ordersQuestion,

  // @ts-expect-error saved question queries only support source and enabled
  fields: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
} satisfies MetabaseQueryOptions<OrdersQuestion>;

const _validCardQuery = {
  query: {
    "lib/type": "mbql/query",
    database: 1,
    stages: [],
  },
} satisfies MetabaseCard;

// Only this value's *type* is used: the fixtures below typecheck, they never run.
const hookResult = {} as UseMetabaseQueryObjectResult;
const _validHookResultCard = {
  query: hookResult.query,
} satisfies MetabaseCard;

const _invalidHookResultCard = {
  // @ts-expect-error pass useMetabaseQueryObject(...).query, not the whole hook result
  query: hookResult,
} satisfies MetabaseCard;

const _invalidCrossTableMetricAggregationQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error metric aggregations must belong to the source table
    TEST_SCHEMA.metrics.productRevenue,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidIdOnlyMetricAggregationQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error metric aggregations must include source table metadata
    { type: "metric", id: 31 },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidSourceCardMetricAggregationQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error source-card metric aggregations need a saved question source
    TEST_SCHEMA.metrics.questionRevenue,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidMetricSourceQuery = {
  // @ts-expect-error Metrics must be used in aggregations, not as query sources
  source: TEST_SCHEMA.metrics.revenue,
} satisfies MetabaseQueryOptions;

function TypeFixtures() {
  const selectedFieldsResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    fields: [TEST_SCHEMA.tables.orders.fields.id],
  });

  const selectedFieldValue: number | null | undefined =
    selectedFieldsResult.data?.rows[0]?.ID;

  void selectedFieldValue;

  const selectedFieldsQuery = {
    source: TEST_SCHEMA.tables.orders,
    fields: [
      TEST_SCHEMA.tables.orders.fields.id,
      TEST_SCHEMA.tables.orders.fields.status,
    ],
  } satisfies MetabaseQueryOptions<OrdersTable>;

  const selectedFieldsQueryResult = useMetabaseQuery(selectedFieldsQuery);

  const selectedQueryFieldValue: string | null | undefined =
    selectedFieldsQueryResult.data?.rows[0]?.STATUS;

  void selectedQueryFieldValue;

  const scalarAggregationResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [sum(TEST_SCHEMA.tables.orders.fields.amount)],
  });

  const scalarAggregationValue: RowValue | undefined =
    scalarAggregationResult.data?.rows[0]?.sum;

  void scalarAggregationValue;

  // @ts-expect-error aggregation result rows should not include source fields
  void scalarAggregationResult.data?.rows[0]?.amount;

  const metricResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [TEST_SCHEMA.metrics.revenue],
  });

  const metricAggregationValue = metricResult.data?.rows[0];

  void metricAggregationValue;

  // @ts-expect-error aggregation result rows should not include source fields
  void metricResult.data?.rows[0]?.status;

  const groupedMetricResult = useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [TEST_SCHEMA.metrics.revenue],
    breakouts: [
      breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
        unit: "month",
      }),
    ],
  });

  const groupedMetricBreakoutValue: string | Date | null | undefined =
    groupedMetricResult.data?.rows[0]?.CREATED_AT;

  void groupedMetricBreakoutValue;

  // @ts-expect-error result row keys use returned column names, not schema object keys
  void groupedMetricResult.data?.rows[0]?.createdAt;

  const sortKey: "amount" | "createdAt" = "createdAt";

  type OrdersField =
    (typeof TEST_SCHEMA.tables.orders.fields)[keyof typeof TEST_SCHEMA.tables.orders.fields];

  const sortFields = {
    amount: TEST_SCHEMA.tables.orders.fields.amount,
    createdAt: TEST_SCHEMA.tables.orders.fields.createdAt,
  } satisfies Record<string, OrdersField>;

  useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    orderBys: [orderBy(sortFields[sortKey], "desc")],
  });

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
    mockGetMetadataUnfiltered.mockReturnValue(
      // `Metadata` is a class; the fixture is the plain shape read out of it.
      TEST_METADATA as unknown as ReturnType<typeof getMetadataUnfiltered>,
    );
    mockUseLazySelector.mockReturnValue({ status: "success" });
    mockUseSdkLoadingState.mockReturnValue(LOADED_SDK_STATE);
    mockPropsStore(createMockStore());
    window.METABASE_EMBEDDING_SDK_BUNDLE = undefined;
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
      orderBy: expect.any(Function),
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
      orderBys: [
        orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, "desc", {
          unit: "month",
        }),
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
          "order-by": [
            [
              "desc",
              expect.anything(),
              [
                "field",
                expect.objectContaining({ "temporal-unit": "month" }),
                103,
              ],
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

    expect(stagesOf(datasetQuery)[0].aggregation).toEqual([
      ["measure", expect.anything(), 21],
    ]);
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

  it("loads metric aggregation metadata and passes the public table source DSL through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
      source: TEST_SCHEMA.tables.orders,
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(
          TEST_SCHEMA.metrics.revenue.dimensions.orders.status,
          "=",
          "paid",
        ),
      ],
      aggregations: [
        TEST_SCHEMA.metrics.revenue,
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

    expect(mockFetchTableMetadata).toHaveBeenCalledWith({ id: 1 });

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

  it("builds metric queries with FK-joined dimension breakouts", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.product),
      ],
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [
        {
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [
            ["field", expect.objectContaining({ "source-field": 104 }), 202],
          ],
        },
      ],
    });
  });

  it("passes generated metric dimension orderBys through Lib.createTestQuery", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
          unit: "month",
        }),
      ],
      orderBys: [
        orderBy(
          TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt,
          "desc",
          { unit: "month" },
        ),
      ],
      limit: 12,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
          "order-by": [
            [
              "desc",
              expect.anything(),
              [
                "field",
                expect.objectContaining({ "temporal-unit": "month" }),
                103,
              ],
            ],
          ],
          limit: 12,
        },
      ],
    });
  });

  it("loads saved question metadata and passes the question source through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
      source: TEST_SCHEMA.questions.ordersQuestion,
    });

    expect(mockFetchTableMetadata).not.toHaveBeenCalled();

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      1,
      { id: 41 },
      store.dispatch,
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    );

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      2,
      41,
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
          "source-card": 41,
        },
      ],
    });
  });

  it("passes aggregation result orderBys through Lib.createTestQuery", async () => {
    const avgAmount = avg(TEST_SCHEMA.tables.orders.fields.amount);

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [avgAmount],
      breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
      orderBys: [orderBy(avgAmount, "desc")],
      limit: 15,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          aggregation: [
            ["avg", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [["field", expect.anything(), 101]],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 15,
        },
      ],
    });
  });

  it("passes metric aggregation result orderBys through Lib.createTestQuery", async () => {
    const avgAmount = avg(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount);

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue, avgAmount],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.status),
      ],
      orderBys: [orderBy(avgAmount, "desc")],
      limit: 15,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          aggregation: [
            ["metric", expect.anything(), 31],
            ["avg", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [["field", expect.anything(), 101]],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 15,
        },
      ],
    });
  });

  it("passes metric aggregation orderBys through Lib.createTestQuery", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.status),
      ],
      orderBys: [orderBy(TEST_SCHEMA.metrics.revenue, "desc")],
      limit: 15,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [["field", expect.anything(), 101]],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 15,
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

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        orderBys: [orderBy(TEST_SCHEMA.tables.products.fields.price, "desc")],
      }),
    ).rejects.toThrow(
      "Table query orderBys must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [avg(TEST_SCHEMA.tables.orders.fields.amount)],
        breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
        orderBys: [orderBy(TEST_SCHEMA.tables.orders.fields.amount, "desc")],
      }),
    ).rejects.toThrow(
      "Table query orderBys for grouped queries must use query breakouts or aggregations included in the query.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        breakouts: [
          breakout(TEST_SCHEMA.tables.orders.fields.createdAt, {
            unit: "month",
          }),
        ],
        orderBys: [
          orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, "desc", {
            unit: "year",
          }),
        ],
      }),
    ).rejects.toThrow(
      "Table query orderBys for grouped queries must use query breakouts or aggregations included in the query.",
    );
  });

  it("rejects cross-table metric aggregations with clear error messages", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [TEST_SCHEMA.metrics.productRevenue],
      }),
    ).rejects.toThrow(
      "Table query metric aggregations must belong to source table 1, but received mapped table ids 2.",
    );
  });

  it("rejects metric aggregations without source table metadata", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [{ type: "metric", id: 31 }],
      }),
    ).rejects.toThrow(
      "Table query metric aggregations must include source table metadata.",
    );
  });

  it("rejects source-card metric aggregations under table sources", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [TEST_SCHEMA.metrics.questionRevenue],
      }),
    ).rejects.toThrow(
      "Table query metric aggregations cannot use source-card Metrics. Use a saved question source for source-card Metrics.",
    );
  });

  it("rejects unsupported saved question query clauses with a clear error message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        fields: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
      }),
    ).rejects.toThrow(
      "Saved question queries only support source and enabled, but received fields.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        limit: 10,
      }),
    ).rejects.toThrow(
      "Saved question queries only support source and enabled, but received limit.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [avg(TEST_SCHEMA.questions.ordersQuestion.columns[1])],
      }),
    ).rejects.toThrow(
      "Saved question queries only support source and enabled, but received aggregations.",
    );
  });

  it("rejects metric sources with a clear error message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        // @ts-expect-error a metric is not a valid query source
        source: TEST_SCHEMA.metrics.revenue,
      }),
    ).rejects.toThrow(
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
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
    stubSdkBundle({ resolveDatasetQuery });

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
    stubSdkBundle({ resolveDatasetQuery });

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
    stubSdkBundle({ resolveDatasetQuery });
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
    const secondDatasetQuery = mbqlQuery([{ "source-table": 1, limit: 20 }]);
    // Which deferred a call gets is decided by the only field that differs.
    const resolveDatasetQuery = jest.fn(
      () => (input: QueryInput) =>
        "limit" in input && input.limit === 10
          ? firstDeferred.promise
          : secondDeferred.promise,
    );
    stubSdkBundle({ resolveDatasetQuery });

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
    stubSdkBundle({
      resolveDatasetQuery: jest.fn(() => jest.fn(() => deferred.promise)),
      queryDataset: jest.fn(() => queryDataset),
    });

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
