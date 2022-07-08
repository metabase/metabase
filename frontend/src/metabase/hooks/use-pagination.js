import { useState, useCallback } from "react";

export const usePagination = (initialPage = 0) => {
  const [page, setPage] = useState(initialPage);

  const handleNextPage = useCallback(
    () => setPage(prev => prev + 1),
    [setPage],
  );
  const handlePreviousPage = useCallback(
    () => setPage(prev => prev - 1),
    [setPage],
  );

  return {
    handleNextPage,
    handlePreviousPage,
    setPage,
    page,
  };
};
