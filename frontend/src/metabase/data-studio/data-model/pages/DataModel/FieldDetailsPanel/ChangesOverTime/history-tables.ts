import { useCallback } from "react";

import {
  isHistoryTableName,
  isRoleA,
  useTableStructures,
} from "metabase/metadata/table-structure";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

/** Whether a table holds past versions: by its History role or its name */
export function useIsHistoryTable() {
  const { getTableStructure } = useTableStructures();
  return useCallback(
    (table: Table) => {
      const { role } = getTableStructure(table);
      const hasHistoryRole =
        role != null && isRoleA(role, "role/HistoryDimension");
      return hasHistoryRole || isHistoryTableName(table);
    },
    [getTableStructure],
  );
}

/** Where a table's role, key and dates are set */
export function getTableMetadataUrl(table: Table) {
  return table.is_published
    ? Urls.dataStudioTableMetadata(table.id)
    : Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
      });
}
