import { useEffect, useMemo } from "react";

import { tableApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import type { Table } from "metabase-types/api";

const selectTableQueryMetadata =
  tableApi.endpoints.getTableQueryMetadata.select;

/**
 * Fetches table query metadata for a dynamic list of table IDs.
 * Uses RTK Query's initiate/select pattern to avoid the "hooks in a loop" problem.
 */
export function useTableQueryMetadataResults(tableIds: number[]) {
  const dispatch = useDispatch();

  useEffect(() => {
    const subscriptions = tableIds.map((id) =>
      dispatch(tableApi.endpoints.getTableQueryMetadata.initiate({ id })),
    );
    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [dispatch, tableIds]);

  const selectors = useMemo(
    () => tableIds.map((id) => selectTableQueryMetadata({ id })),
    [tableIds],
  );

  return useSelector((state) => {
    const results = selectors.map((sel) => sel(state));
    const isLoading = results.some((r) => r.isLoading);
    const hasError = results.some((r) => r.isError);
    const tables = results
      .map((r) => r.data)
      .filter((t): t is Table => t != null);
    return { isLoading, hasError, tables };
  });
}
