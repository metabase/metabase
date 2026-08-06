import { useCallback, useState } from "react";
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

function useAllUsageMetadataPages<T>(
  params: ListUsageMetadataRequest,
  firstPage: UsageMetadataPage<T> | undefined,
  firstPageError: unknown,
  isFirstPageFetching: boolean,
  fetchPage: (
    params: ListUsageMetadataRequest,
  ) => Promise<UsageMetadataPage<T>>,
  refetch: () => void,
): UsageMetadataListResult<T> {
  const [data, setData] = useState<UsageMetadataPage<T>>();
  const [remainingPagesError, setRemainingPagesError] = useState<unknown>();
  const [areRemainingPagesFetching, setAreRemainingPagesFetching] =
    useState(false);

  useDeepCompareEffect(() => {
    let cancelled = false;

    if (!firstPage) {
      setData(undefined);
      setRemainingPagesError(undefined);
      setAreRemainingPagesFetching(false);
      return;
    }

    const remainingPageCount = Math.max(
      0,
      Math.ceil(firstPage.total / LIST_PAGE_SIZE) - 1,
    );
    if (remainingPageCount === 0) {
      setData({ ...firstPage, limit: null, offset: null });
      setRemainingPagesError(undefined);
      setAreRemainingPagesFetching(false);
      return;
    }

    setAreRemainingPagesFetching(true);
    setRemainingPagesError(undefined);
    Promise.all(
      Array.from({ length: remainingPageCount }, (_, index) =>
        fetchPage(pageParams(params, (index + 1) * LIST_PAGE_SIZE)),
      ),
    )
      .then((remainingPages) => {
        if (cancelled) {
          return;
        }
        if (
          remainingPages.some(
            (page) => page.snapshot?.id !== firstPage.snapshot?.id,
          )
        ) {
          throw new Error(
            "The usage metadata snapshot changed while loading the list",
          );
        }
        setData({
          ...firstPage,
          data: [firstPage, ...remainingPages].flatMap((page) => page.data),
          limit: null,
          offset: null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRemainingPagesError(error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAreRemainingPagesFetching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPage, firstPage, params]);

  return {
    data,
    error: firstPageError ?? remainingPagesError,
    isFetching: isFirstPageFetching || areRemainingPagesFetching,
    refetch,
  };
}

export function useAllUsageMetadataTables(
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

  return useAllUsageMetadataPages(
    params,
    firstPageQuery.data,
    firstPageQuery.error,
    firstPageQuery.isFetching,
    fetchPage,
    firstPageQuery.refetch,
  );
}

export function useAllUsageMetadataCandidates(
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

  return useAllUsageMetadataPages(
    params,
    firstPageQuery.data,
    firstPageQuery.error,
    firstPageQuery.isFetching,
    fetchPage,
    firstPageQuery.refetch,
  );
}
