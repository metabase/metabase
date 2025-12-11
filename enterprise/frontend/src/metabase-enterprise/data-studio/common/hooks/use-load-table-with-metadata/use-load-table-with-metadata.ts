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
    tableId != null
      ? { id: tableId, include_editable_data_model: true }
      : skipToken,
  );

  useEffect(() => {
    if (includeForeignTables && table) {
      dispatch(
        fetchForeignTablesMetadata(table, {
          include_editable_data_model: true,
        }),
      );
    }
  }, [dispatch, table, includeForeignTables]);

  return { table, isLoading, error };
}
