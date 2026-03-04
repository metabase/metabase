import { useEffect } from "react";

import {
  fetchForeignTablesMetadata,
  skipToken,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import type { TableId } from "metabase-types/api";

type UseLoadTableWithMetadataOptions = {
  includeForeignTables?: boolean;
};

export function useLoadTableWithMetadata(
  tableId: TableId | undefined,
  { includeForeignTables = false }: UseLoadTableWithMetadataOptions = {},
) {
  const dispatch = useDispatch();

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  useEffect(() => {
    if (includeForeignTables && table) {
      dispatch(fetchForeignTablesMetadata(table));
    }
  }, [dispatch, table, includeForeignTables]);

  return { table, isLoading, error };
}
