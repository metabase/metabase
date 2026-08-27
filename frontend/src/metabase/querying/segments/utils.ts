import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery, TableId } from "metabase-types/api";

export function getSegmentQuery(
  query: DatasetQuery | undefined,
  tableId: TableId | undefined,
  metadata: Metadata,
) {
  if (!query) {
    return undefined;
  }

  const databaseId = query.database;

  if (!databaseId) {
    console.error("No database ID found in segment definition:", {
      query,
      tableId,
    });
    return undefined;
  }

  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  return Lib.fromJsQuery(metadataProvider, query);
}

export function getSegmentQueryDefinition(query: Lib.Query) {
  // Return the full MBQL5 query like Question.setQuery() does
  return Lib.toJsQuery(query);
}
