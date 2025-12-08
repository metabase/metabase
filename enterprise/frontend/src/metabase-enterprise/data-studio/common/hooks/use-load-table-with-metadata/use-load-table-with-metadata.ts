import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import type { TableId } from "metabase-types/api";

export function useLoadTableWithMetadata(tableId: TableId | undefined) {
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null
      ? { id: tableId, include_editable_data_model: true }
      : skipToken,
  );

  return {
    table,
    isLoading,
    error,
  };
}
