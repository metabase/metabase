import * as Lib from "metabase-lib";
import type {
  Dataset,
  DatasetQuery,
  GetLibraryCollectionResponse,
} from "metabase-types/api";

export function getResultMetadata(
  currentQuery: DatasetQuery,
  lastRunQuery: DatasetQuery | null,
  lastRunResult: Dataset | null,
) {
  if (
    lastRunQuery != null &&
    lastRunResult != null &&
    Lib.areLegacyQueriesEqual(currentQuery, lastRunQuery)
  ) {
    return lastRunResult.data?.results_metadata?.columns ?? null;
  }
  return null;
}

// TODO Alex P 12/05/2025 Fix the endpoint to return sensible data
export const hasLibraryCollection = (
  libraryCollection?: GetLibraryCollectionResponse,
) => libraryCollection != null && "name" in libraryCollection;
