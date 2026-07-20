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

import { TEST_METADATA } from "./fixtures";

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

export const createMockStore = (): SdkStore =>
  // A real `getSdkStore()` pulls in reducers this spec's API mock cannot satisfy.
  ({
    dispatch: jest.fn((action) => Promise.resolve(action)),
    getState: jest.fn(() => ({})),
  }) as unknown as SdkStore;

type MbqlStage = Record<string, unknown>;

export const createMockDatasetQuery = (stages: MbqlStage[]): DatasetQuery =>
  // `DatasetQuery` is opaque, so a test cannot construct it without type casts.
  ({
    "lib/type": "mbql/query",
    database: 1,
    stages,
  }) as unknown as DatasetQuery;

export const stagesOf = (query: DatasetQuery): MbqlStage[] =>
  // `DatasetQuery` does not expose its stages in its public type.
  (query as unknown as { stages: MbqlStage[] }).stages;

export const TEST_DATASET_QUERY = createMockDatasetQuery([
  { "source-table": 1 },
]);

export const mockPropsStore = (reduxStore: SdkStore) =>
  mockUseMetabaseProviderPropsStore.mockReturnValue({
    state: { internalProps: { reduxStore }, props: null },
    store: ensureMetabaseProviderPropsStore(),
  });

export const stubSdkBundle = (
  bundleExports: Partial<MetabaseEmbeddingSdkBundleExports>,
): void => {
  window.METABASE_EMBEDDING_SDK_BUNDLE =
    // The global is typed as the whole bundle; tests install only needed functions.
    bundleExports as MetabaseEmbeddingSdkBundleExports;
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
