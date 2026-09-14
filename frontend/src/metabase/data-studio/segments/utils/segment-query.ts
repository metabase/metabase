import * as Lib from "metabase-lib";
import type { DatasetQuery, Table } from "metabase-types/api";

export function createInitialQueryForTable(
  table: Table,
  metadataProvider: Lib.MetadataProvider,
): DatasetQuery | null {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
  if (!tableMetadata) {
    return null;
  }
  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );
  return Lib.toJsQuery(query);
}
