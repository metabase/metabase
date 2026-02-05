import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery, Table } from "metabase-types/api";

export function createInitialQueryForTable(
  table: Table,
  metadata: Metadata,
): DatasetQuery | null {
  const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
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
