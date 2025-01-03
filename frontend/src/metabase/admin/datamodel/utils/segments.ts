import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { StructuredQuery, TableId } from "metabase-types/api";

export function getSegmentQuery(
  query: StructuredQuery | undefined,
  tableId: TableId | undefined,
  metadata: Metadata,
) {
  const table = metadata.table(tableId);
  const metadataProvider = table
    ? Lib.metadataProvider(table.db_id, metadata)
    : undefined;

  return table && query && metadataProvider
    ? Lib.fromLegacyQuery(table.db_id, metadataProvider, {
        type: "query",
        database: table.db_id,
        query: query,
      })
    : undefined;
}

export function getSegmentQueryDefinition(query: Lib.Query) {
  const datasetQuery = Lib.toLegacyQuery(query);
  if (datasetQuery.type === "query") {
    return datasetQuery.query;
  }
}
