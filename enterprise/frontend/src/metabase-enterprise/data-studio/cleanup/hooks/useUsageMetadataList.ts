import { useCallback, useRef, useState } from "react";
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

function useUsageMetadataPages<T>(
  params: ListUsageMetadataRequest,
  firstPage: UsageMetadataPage<T> | undefined,
  firstPageError: unknown,
  isFirstPageFetching: boolean,
  fetchPage: (
    params: ListUsageMetadataRequest,
  ) => Promise<UsageMetadataPage<T>>,
  getItemId: (item: T) => number,
  refetch: () => void,
): UsageMetadataListResult<T> {
  const [data, setData] = useState<UsageMetadataPage<T>>();
  const [nextPageError, setNextPageError] = useState<unknown>();
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const isNextPagePending = useRef(false);
  const generation = useRef(0);

  useDeepCompareEffect(() => {
    generation.current += 1;
    isNextPagePending.current = false;
    setNextPageError(undefined);
    setIsFetchingNextPage(false);
    setData(firstPage);
  }, [firstPage, params]);

  const fetchNextPage = useCallback(async () => {
    const isComplete = data == null || data.data.length >= data.total;
    if (isComplete || isNextPagePending.current) {
      return;
    }

    const requestGeneration = generation.current;
    isNextPagePending.current = true;
    setIsFetchingNextPage(true);
    setNextPageError(undefined);

    try {
      const nextPage = await fetchPage(pageParams(params, data.data.length));
      if (requestGeneration !== generation.current) {
        return;
      }
      if (nextPage.snapshot?.id !== data.snapshot?.id) {
        throw new Error(
          "The usage metadata snapshot changed while loading the list",
        );
      }
      if (nextPage.total !== data.total) {
        // Candidate mutations can change queue membership without creating a
        // new mining snapshot. Offsets are no longer trustworthy, so keep the
        // cached UI visible and restart pagination from the first page.
        generation.current += 1;
        isNextPagePending.current = false;
        setIsFetchingNextPage(false);
        refetch();
        return;
      }
      setData((currentData) => {
        if (
          currentData == null ||
          currentData.snapshot?.id !== nextPage.snapshot?.id
        ) {
          return currentData;
        }
        return {
          ...currentData,
          data: appendUniqueItems(currentData.data, nextPage.data, getItemId),
          total: nextPage.total,
        };
      });
    } catch (error) {
      if (requestGeneration === generation.current) {
        setNextPageError(error);
      }
    } finally {
      if (requestGeneration === generation.current) {
        isNextPagePending.current = false;
        setIsFetchingNextPage(false);
      }
    }
  }, [data, fetchPage, getItemId, params, refetch]);

  return {
    data,
    error: firstPageError ?? nextPageError,
    isFetching: isFirstPageFetching,
    isFetchingNextPage,
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
