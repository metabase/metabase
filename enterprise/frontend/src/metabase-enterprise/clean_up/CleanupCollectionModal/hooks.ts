import { useCallback, useState } from "react";

export const usePagination = ({
  pageSize: inputPageSize,
  initialPage,
}: {
  pageSize: number;
  initialPage: number;
}) => {
  const pageSize = Math.round(Math.max(inputPageSize, 1)); // avoid divide by zero
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState(initialPage ?? 0);

  const onNextPage = useCallback(() => setPage(prev => prev + 1), [setPage]);
  const onPreviousPage = useCallback(
    () => setPage(prev => prev - 1),
    [setPage],
  );
  const resetPage = useCallback(
    () => setPage(initialPage),
    [setPage, initialPage],
  );

  return {
    onNextPage,
    onPreviousPage,
    setPage,
    page,
    pages: Math.ceil(total ?? 0 / pageSize),
    resetPage,
    hasPagination: total ? total > pageSize : false,
    pageSize,
    paginationFilters: { limit: pageSize, offset: pageSize * page },
    total,
    setTotal,
  };
};
