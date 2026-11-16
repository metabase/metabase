import { useMemo } from "react";

import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

/** A blank query on `table`. Undefined until its metadata is loaded. */
export const useTableQuery = (
  table: Table | undefined,
): Lib.Query | undefined => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  return useMemo(() => {
    if (table === undefined) {
      return undefined;
    }
    const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
    return tableMetadata
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata)
      : undefined;
  }, [metadataProvider, table]);
};
