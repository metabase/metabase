import { useCallback, useReducer, useRef } from "react";
import { useDeepCompareEffect } from "react-use";

import { useDispatch } from "metabase/redux";
import {
  usageMetadataApi,
  useListUsageMetadataCandidatesQuery,
  useListUsageMetadataTablesQuery,
} from "metabase-enterprise/api";
import type {
  ListUsageMetadataRequest,
  UsageMetadataCandidateSummary,
  UsageMetadataPage,
  UsageMetadataTableSummary,
} from "metabase-types/api";

const LIST_PAGE_SIZE = 200;

type UsageMetadataListResult<T> = {
  data: UsageMetadataPage<T> | undefined;
  error: unknown;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<void>;
  refetch: () => void;
};

type PaginationState<T> = {
  data: UsageMetadataPage<T> | undefined;
  nextPageError: unknown;
  status: "idle" | "fetching-next" | "restarting";
};

type PaginationAction<T> =
  | { type: "reset"; data: UsageMetadataPage<T> | undefined }
  | { type: "fetch-next" }
  | { type: "append"; data: UsageMetadataPage<T> }
  | { type: "fetch-error"; error: unknown }
  | { type: "restart" }
  | { type: "restart-complete" };

function paginationReducer<T>(
  state: PaginationState<T>,
  action: PaginationAction<T>,
): PaginationState<T> {
  switch (action.type) {
    case "reset":
      return { data: action.data, nextPageError: undefined, status: "idle" };
    case "fetch-next":
      return { ...state, nextPageError: undefined, status: "fetching-next" };
    case "append":
      return { data: action.data, nextPageError: undefined, status: "idle" };
    case "fetch-error":
      return { ...state, nextPageError: action.error, status: "idle" };
    case "restart":
      return { ...state, nextPageError: undefined, status: "restarting" };
    case "restart-complete":
      return { ...state, status: "idle" };
  }
}

function pageParams(params: ListUsageMetadataRequest, offset: number) {
  const { limit: _limit, offset: _offset, ...filters } = params;
  return {
    ...filters,
    limit: LIST_PAGE_SIZE,
    offset,
  };
}

export function appendUniqueItems<T>(
  currentItems: T[],
  nextItems: T[],
  getItemId: (item: T) => number,
) {
  const ids = new Set(currentItems.map(getItemId));
  return [
    ...currentItems,
    ...nextItems.filter((item) => {
      const id = getItemId(item);
      if (ids.has(id)) {
        return false;
      }
      ids.add(id);
      return true;
    }),
  ];
}

export function useUsageMetadataPages<T>(
  params: ListUsageMetadataRequest,
  firstPage: UsageMetadataPage<T> | undefined,
  firstPageError: unknown,
  isFirstPageFetching: boolean,
  fetchPage: (
    params: ListUsageMetadataRequest,
  ) => Promise<UsageMetadataPage<T>>,
  getItemId: (item: T) => number,
  refetch: () => unknown,
): UsageMetadataListResult<T> {
  const [state, dispatchPagination] = useReducer(paginationReducer<T>, {
    data: undefined,
    nextPageError: undefined,
    status: "idle",
  });
  const isNextPagePending = useRef(false);
  const generation = useRef(0);

  useDeepCompareEffect(() => {
    generation.current += 1;
    isNextPagePending.current = false;
    dispatchPagination({ type: "reset", data: firstPage });
  }, [firstPage, params]);

  const restartPagination = useCallback(() => {
    generation.current += 1;
    const restartGeneration = generation.current;
    isNextPagePending.current = false;
    dispatchPagination({ type: "restart" });
    const finishRestart = () => {
      if (generation.current === restartGeneration) {
        dispatchPagination({ type: "restart-complete" });
      }
    };
    void Promise.resolve().then(refetch).then(finishRestart, finishRestart);
  }, [refetch]);

  const fetchNextPage = useCallback(async () => {
    const data = state.data;
    const isComplete = data == null || data.data.length >= data.total;
    if (isComplete || isNextPagePending.current) {
      return;
    }

    const requestGeneration = generation.current;
    isNextPagePending.current = true;
    dispatchPagination({ type: "fetch-next" });

    try {
      const nextPage = await fetchPage(pageParams(params, data.data.length));
      if (requestGeneration !== generation.current) {
        return;
      }
      if (nextPage.snapshot?.id !== data.snapshot?.id) {
        // A completed analysis makes every previously loaded offset stale.
        // Keep the cached list visible while restarting from the new first page.
        restartPagination();
        return;
      }
      if (nextPage.total !== data.total) {
        // Candidate mutations can change queue membership without creating a
        // new mining snapshot. Offsets are no longer trustworthy, so keep the
        // cached UI visible and restart pagination from the first page.
        restartPagination();
        return;
      }
      dispatchPagination({
        type: "append",
        data: {
          ...data,
          data: appendUniqueItems(data.data, nextPage.data, getItemId),
          total: nextPage.total,
        },
      });
    } catch (error) {
      if (requestGeneration === generation.current) {
        dispatchPagination({ type: "fetch-error", error });
      }
    } finally {
      if (requestGeneration === generation.current) {
        isNextPagePending.current = false;
      }
    }
  }, [fetchPage, getItemId, params, restartPagination, state.data]);

  return {
    data: state.data,
    error: firstPageError ?? state.nextPageError,
    isFetching: isFirstPageFetching || state.status === "restarting",
    isFetchingNextPage: state.status === "fetching-next",
    fetchNextPage,
    refetch,
  };
}

const getTableId = (table: UsageMetadataTableSummary) => Number(table.table.id);
const getCandidateId = (candidate: UsageMetadataCandidateSummary) =>
  candidate.id;

export function useUsageMetadataTables(
  params: ListUsageMetadataRequest,
): UsageMetadataListResult<UsageMetadataTableSummary> {
  const dispatch = useDispatch();
  const firstPageQuery = useListUsageMetadataTablesQuery(pageParams(params, 0));
  const fetchPage = useCallback(
    (page: ListUsageMetadataRequest) =>
      dispatch(
        usageMetadataApi.endpoints.listUsageMetadataTables.initiate(page, {
          forceRefetch: true,
          subscribe: false,
        }),
      ).unwrap(),
    [dispatch],
  );

  return useUsageMetadataPages(
    params,
    firstPageQuery.currentData,
    firstPageQuery.error,
    firstPageQuery.isFetching,
    fetchPage,
    getTableId,
    firstPageQuery.refetch,
  );
}

export function useUsageMetadataCandidates(
  params: ListUsageMetadataRequest,
  { skip = false } = {},
): UsageMetadataListResult<UsageMetadataCandidateSummary> {
  const dispatch = useDispatch();
  const firstPageQuery = useListUsageMetadataCandidatesQuery(
    pageParams(params, 0),
    { skip },
  );
  const fetchPage = useCallback(
    (page: ListUsageMetadataRequest) =>
      dispatch(
        usageMetadataApi.endpoints.listUsageMetadataCandidates.initiate(page, {
          forceRefetch: true,
          subscribe: false,
        }),
      ).unwrap(),
    [dispatch],
  );

  return useUsageMetadataPages(
    params,
    firstPageQuery.currentData,
    firstPageQuery.error,
    firstPageQuery.isFetching,
    fetchPage,
    getCandidateId,
    firstPageQuery.refetch,
  );
}
