/* eslint-disable import/order */

import {
  TEST_DATASET_QUERY,
  createDeferred,
  createMockDatasetQuery,
  mockUseLazySelector,
  resetTestState,
  stubSdkBundle,
} from "./setup";
import { TEST_SCHEMA } from "./fixtures";

import { act, renderHook, waitFor } from "@testing-library/react";

import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { QueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { DatasetQuery } from "metabase-types/api";

import { filter, useMetabaseQuery, useMetabaseQueryObject } from "..";

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

describe("dynamic query clauses", () => {
  const staticQuery = { source: TEST_SCHEMA.tables.orders };

  it("re-resolves when only the dynamic part changes", async () => {
    const resolveQuery = jest.fn(() => Promise.resolve(TEST_DATASET_QUERY));
    stubSdkBundle({ resolveDatasetQuery: jest.fn(() => resolveQuery) });

    const { rerender } = renderHook(
      ({ dynamicQuery }) => useMetabaseQueryObject(staticQuery, dynamicQuery),
      { initialProps: { dynamicQuery: { limit: 10 } } },
    );

    await waitFor(() => expect(resolveQuery).toHaveBeenCalledTimes(1));

    // The static query object is referentially identical across renders, so only
    // the dynamic part can invalidate the cached result.
    rerender({ dynamicQuery: { limit: 20 } });

    await waitFor(() => expect(resolveQuery).toHaveBeenCalledTimes(2));
    expect(resolveQuery).toHaveBeenLastCalledWith(staticQuery, { limit: 20 });
  });

  it("does not re-resolve when the dynamic part is deep-equal", async () => {
    const resolveQuery = jest.fn(() => Promise.resolve(TEST_DATASET_QUERY));
    stubSdkBundle({ resolveDatasetQuery: jest.fn(() => resolveQuery) });

    const { rerender } = renderHook(
      ({ dynamicQuery }) => useMetabaseQueryObject(staticQuery, dynamicQuery),
      { initialProps: { dynamicQuery: { limit: 10 } } },
    );

    await waitFor(() => expect(resolveQuery).toHaveBeenCalledTimes(1));

    // A new object with the same contents — a UI rebuilding it every render.
    rerender({ dynamicQuery: { limit: 10 } });

    await act(async () => {
      await Promise.resolve();
    });
    expect(resolveQuery).toHaveBeenCalledTimes(1);
  });

  it("does not refetch when a re-render rebuilds both arguments", async () => {
    const resolveQuery = jest.fn(() => Promise.resolve(TEST_DATASET_QUERY));
    const queryDataset = jest.fn(() =>
      Promise.resolve({ rowCount: 0, runningTime: 1, columns: [], rows: [] }),
    );
    stubSdkBundle({
      resolveDatasetQuery: jest.fn(() => resolveQuery),
      queryDataset: jest.fn(() => queryDataset),
    });

    // Both arguments are fresh objects on every render, the way a component
    // builds them inline. The hooks key on content, so this must not refetch.
    const { rerender } = renderHook(() =>
      useMetabaseQuery(
        { source: TEST_SCHEMA.tables.orders, savedQuestionSourceId: 41 },
        {
          filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "x")],
        },
      ),
    );

    await waitFor(() => expect(queryDataset).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    await act(async () => {
      await Promise.resolve();
    });
    expect(queryDataset).toHaveBeenCalledTimes(1);
    expect(resolveQuery).toHaveBeenCalledTimes(1);
  });

  it("passes the dynamic part to the dataset query", async () => {
    const resolveQuery = jest.fn(() => Promise.resolve(TEST_DATASET_QUERY));
    const queryDataset = jest.fn(() =>
      Promise.resolve({ rowCount: 0, runningTime: 1, columns: [], rows: [] }),
    );
    stubSdkBundle({
      resolveDatasetQuery: jest.fn(() => resolveQuery),
      queryDataset: jest.fn(() => queryDataset),
    });

    const dynamicQuery = { limit: 5 };

    renderHook(() => useMetabaseQuery(staticQuery, dynamicQuery));

    await waitFor(() =>
      expect(resolveQuery).toHaveBeenCalledWith(staticQuery, dynamicQuery),
    );
  });

  it("does not run while the dynamic part is disabled", async () => {
    const resolveQuery = jest.fn(() => Promise.resolve(TEST_DATASET_QUERY));
    const queryDataset = jest.fn(() =>
      Promise.resolve({ rowCount: 0, runningTime: 1, columns: [], rows: [] }),
    );
    stubSdkBundle({
      resolveDatasetQuery: jest.fn(() => resolveQuery),
      queryDataset: jest.fn(() => queryDataset),
    });

    const { rerender } = renderHook(
      ({ dynamicQuery }) => useMetabaseQuery(staticQuery, dynamicQuery),
      { initialProps: { dynamicQuery: { enabled: false, limit: 10 } } },
    );

    await waitFor(() => expect(resolveQuery).not.toHaveBeenCalled());

    // A UI that holds the query back until the user picks a filter value.
    rerender({ dynamicQuery: { enabled: true, limit: 10 } });

    await waitFor(() => expect(resolveQuery).toHaveBeenCalledTimes(1));
  });
});
