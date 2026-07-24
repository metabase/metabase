// oxfmt-ignore
import {
  TEST_DATASET_QUERY,
  createDeferred,
  createMockDatasetQuery,
  mockUseLazySelector,
  resetTestState,
  stubSdkBundle,
} from "./setup";
// oxfmt-ignore
import { TEST_SCHEMA } from "./fixtures";

// oxfmt-ignore
import { act, renderHook, waitFor } from "@testing-library/react";

// oxfmt-ignore
import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
// oxfmt-ignore
import type { QueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
// oxfmt-ignore
import type { DatasetQuery } from "metabase-types/api";

// oxfmt-ignore
import { useMetabaseQuery, useMetabaseQueryObject } from "..";

beforeEach(resetTestState);

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

    const secondDatasetQuery = createMockDatasetQuery([
      { "source-table": 1, limit: 20 },
    ]);

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

    await waitFor(() => expect(resolveDatasetQuery).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondDeferred.resolve(secondDatasetQuery);

      await secondDeferred.promise;
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        query: secondDatasetQuery,
        error: null,
        isLoading: false,
      }),
    );

    await act(async () => {
      firstDeferred.resolve(TEST_DATASET_QUERY);

      await firstDeferred.promise;
    });

    expect(result.current).toEqual({
      query: secondDatasetQuery,
      error: null,
      isLoading: false,
    });
  });
});

describe("useMetabaseQuery", () => {
  it("ignores a stale response after the query changes", async () => {
    const firstQuery = {
      source: TEST_SCHEMA.tables.orders,
      limit: 10,
    };

    const secondQuery = {
      source: TEST_SCHEMA.tables.orders,
      limit: 20,
    };

    const firstDatasetQuery = createMockDatasetQuery([
      { "source-table": 1, limit: 10 },
    ]);

    const secondDatasetQuery = createMockDatasetQuery([
      { "source-table": 1, limit: 20 },
    ]);

    const firstResponse = createDeferred<QueryDatasetResult>();
    const secondResponse = createDeferred<QueryDatasetResult>();

    const runDatasetQuery = jest.fn(
      ({ datasetQuery }: { datasetQuery: DatasetQuery }) =>
        datasetQuery === firstDatasetQuery
          ? firstResponse.promise
          : secondResponse.promise,
    );

    const resolveDatasetQuery = jest.fn(
      () => (input: QueryInput) =>
        Promise.resolve(
          "limit" in input && input.limit === 10
            ? firstDatasetQuery
            : secondDatasetQuery,
        ),
    );

    stubSdkBundle({
      resolveDatasetQuery,
      queryDataset: jest.fn(() => runDatasetQuery),
    });

    const { result, rerender } = renderHook(
      ({ currentQuery }) => useMetabaseQuery(currentQuery),
      { initialProps: { currentQuery: firstQuery } },
    );

    await waitFor(() => expect(runDatasetQuery).toHaveBeenCalledTimes(1));
    rerender({ currentQuery: secondQuery });

    await waitFor(() => expect(runDatasetQuery).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstResponse.resolve({
        rowCount: 1,
        runningTime: 1,
        columns: [],
        rows: [],
      });
      await firstResponse.promise;
    });

    expect(result.current).toMatchObject({
      data: null,
      error: null,
      isLoading: true,
    });

    await act(async () => {
      secondResponse.resolve({
        rowCount: 2,
        runningTime: 2,
        columns: [],
        rows: [],
      });

      await secondResponse.promise;
    });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        data: expect.objectContaining({ rowCount: 2 }),
        error: null,
        isLoading: false,
      }),
    );
  });

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
