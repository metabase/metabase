import * as Lib from "metabase-lib";
import type { Dataset, DatasetQuery } from "metabase-types/api";

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
