import { useMemo } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import {
  type Table,
  type UnsavedCard,
  isConcreteTableId,
} from "metabase-types/api";

export function useTableCard(table: Table | undefined): UnsavedCard | null {
  const tableId = table != null && isConcreteTableId(table.id) ? table.id : null;
  const { data: loadedTable } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );
  const metadataProvider = useMetadataProvider(loadedTable?.db_id ?? null);

  return useMemo(() => {
    if (loadedTable == null || tableId == null) {
      return null;
    }

    const tableMetadata = Lib.tableMetadata(metadataProvider, tableId);
    if (tableMetadata == null) {
      return null;
    }

    const query = Lib.queryFromTableOrCardMetadata(
      metadataProvider,
      tableMetadata,
    );
    return {
      display: "table",
      dataset_query: Lib.toJsQuery(query),
      visualization_settings: {},
    };
  }, [loadedTable, tableId, metadataProvider]);
}
