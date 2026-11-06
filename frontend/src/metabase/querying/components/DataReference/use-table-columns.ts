import { useMemo } from "react";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

const STAGE_INDEX = -1;

export type TableQueryAndColumns = {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
};

export function useTableColumns(tableId: TableId) {
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery({ id: tableId });
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);

  const queryAndColumns = useMemo((): TableQueryAndColumns | undefined => {
    if (table == null) {
      return undefined;
    }
    const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
    if (tableMetadata == null) {
      return undefined;
    }
    const query = Lib.queryFromTableOrCardMetadata(
      metadataProvider,
      tableMetadata,
    );
    return {
      query,
      stageIndex: STAGE_INDEX,
      columns: Lib.returnedColumns(query, STAGE_INDEX),
    };
  }, [metadataProvider, table]);

  return { table, queryAndColumns, isLoading, error };
}
