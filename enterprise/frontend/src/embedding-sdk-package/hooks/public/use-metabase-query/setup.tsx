/* eslint-disable metabase/no-external-references-for-sdk-package-code */

import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { useLazySelector } from "embedding-sdk-package/hooks/private/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import type { DatasetQuery } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

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

export const mockFetchTableMetadata = jest.mocked(fetchTableMetadata);
export const mockGetMetadataUnfiltered = jest.mocked(getMetadataUnfiltered);
export const mockRunRtkEndpoint = jest.mocked(runRtkEndpoint);
export const mockUseLazySelector = jest.mocked(useLazySelector);
export const mockUseMetabaseProviderPropsStore = jest.mocked(
  useMetabaseProviderPropsStore,
);
export const mockUseSdkLoadingState = jest.mocked(useSdkLoadingState);

export const TEST_SCHEMA = {
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

export const createMockStore = (): SdkStore =>
  // A real `getSdkStore()` pulls in reducers this spec's `metabase/api` mock can't
  // satisfy; only `dispatch` and `getState` are reached, and both land in mocks.
  ({
    dispatch: jest.fn((action) => Promise.resolve(action)),
    getState: jest.fn(() => ({})),
  }) as unknown as SdkStore;

type MbqlStage = Record<string, unknown>;

export const mbqlQuery = (stages: MbqlStage[]): DatasetQuery =>
  // `DatasetQuery` is opaque, so one can't be written as a literal.
  ({
    "lib/type": "mbql/query",
    database: 1,
    stages,
  }) as unknown as DatasetQuery;

export const stagesOf = (query: DatasetQuery): MbqlStage[] =>
  // ...nor its stages read.
  (query as unknown as { stages: MbqlStage[] }).stages;

export const TEST_DATASET_QUERY = mbqlQuery([{ "source-table": 1 }]);

export const mockPropsStore = (reduxStore: SdkStore) =>
  mockUseMetabaseProviderPropsStore.mockReturnValue({
    state: { internalProps: { reduxStore }, props: null },
    store: ensureMetabaseProviderPropsStore(),
  });

export const stubSdkBundle = (
  exports: Partial<MetabaseEmbeddingSdkBundleExports>,
): void => {
  window.METABASE_EMBEDDING_SDK_BUNDLE =
    // The global is typed as the whole bundle; a test needs one or two functions.
    exports as MetabaseEmbeddingSdkBundleExports;
};

export const LOADED_SDK_STATE: ReturnType<typeof useSdkLoadingState> = {
  loadingState: SdkLoadingState.Loaded,
  loadingError: null,
  isInitial: false,
  isLoading: false,
  isLoaded: true,
  isInitialized: false,
  isError: false,
  isNotStartedLoading: false,
};

export function createDeferred<TValue>() {
  let resolve!: (value: TValue) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

export const resetTestState = (): void => {
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
};
