import { useEffect } from "react";

type UsePageInRangeOptions = {
  page: number;
  pageSize: number;
  /** `undefined` until the total belongs to the current request, so a stale or loading one moves nothing */
  total: number | undefined;
  onPageChange: (page: number) => void;
};

/**
 * Moves `page` back to the last page when it points past the end, e.g. after the rest of a later page is deleted.
 * Pagination controls hide once everything fits on one page, which would otherwise strand the user there.
 */
export function usePageInRange({
  page,
  pageSize,
  total,
  onPageChange,
}: UsePageInRangeOptions) {
  useEffect(() => {
    if (total === undefined) {
      return;
    }
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > lastPage) {
      onPageChange(lastPage);
    }
  }, [page, pageSize, total, onPageChange]);
}
