import { useCallback, useMemo, useState } from "react";

import type { EntityQuery } from "./types";

/**
 * @deprecated exists for backwards compatibility
 */
export const usePaginatedQuery = (
  entityQuery: EntityQuery,
  pageSize: number | undefined,
  initialPage: number | undefined,
) => {
  const isPaginated = typeof pageSize === "number";
  const [page, setPage] = useState(initialPage || 0);
  const [hasMorePages, setHasMorePages] = useState<boolean | null>(null);
  const limit = pageSize;
  const offset = isPaginated ? pageSize * page : undefined;

  const handleNextPage = useCallback(() => {
    setPage(page => page + 1);
    setHasMorePages(null);
  }, []);

  const handlePreviousPage = useCallback(() => {
    setPage(page => page - 1);
    setHasMorePages(true);
  }, []);

  const paginatedQuery = useMemo(() => {
    return { ...(entityQuery ?? {}), limit, offset };
  }, [entityQuery, limit, offset]);

  if (!isPaginated) {
    return {
      entityQuery,
      setHasMorePages,
    };
  }

  return {
    entityQuery: paginatedQuery,
    hasMorePages,
    isPaginated,
    page,
    onNextPage: hasMorePages ? handleNextPage : null,
    onPreviousPage: page > 0 ? handlePreviousPage : null,
    setHasMorePages,
  };
};
