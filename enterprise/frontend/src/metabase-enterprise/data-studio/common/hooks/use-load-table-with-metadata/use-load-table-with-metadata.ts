import { useEffect } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import Tables from "metabase/entities/tables";
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
    isLoading: isTableLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null
      ? { id: tableId, include_editable_data_model: true }
      : skipToken,
  );

  useEffect(() => {
    if (!includeForeignTables || tableId == null) {
      return;
    }

    dispatch(Tables.actions.fetchMetadataAndForeignTables({ id: tableId }));
  }, [dispatch, tableId, includeForeignTables]);

  return {
    table,
    isLoading: isTableLoading,
    error,
  };
}
