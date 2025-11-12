import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DatasetQuery,
  StructuredQuery,
  TableId,
} from "metabase-types/api";

export function getSegmentQuery(
  query: StructuredQuery | DatasetQuery | undefined,
  tableId: TableId | undefined,
  metadata: Metadata,
) {
  if (!query) {
    return undefined;
  }

  // Backend returns MBQL5 queries in the definition field
  // Use it directly like Question.query() does with dataset_query
  const metadataProvider = Lib.metadataProvider(
    (query as DatasetQuery)?.database,
    metadata,
  );

  return Lib.fromJsQuery(metadataProvider, query as DatasetQuery);
}

export function getSegmentQueryDefinition(query: Lib.Query) {
  // Return the full MBQL5 query like Question.setQuery() does
  return Lib.toJsQuery(query);
}
