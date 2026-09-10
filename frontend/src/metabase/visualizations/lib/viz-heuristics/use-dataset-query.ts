import { useMemo } from "react";

import { getMetadata } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";

/**
 * The executed query behind a result, as a Lib query, so a heuristic can read
 * aggregations, breakouts and column metadata. Null until the result (and its
 * `json_query`) is available or when the query cannot be built.
 */
export function useDatasetQuery(
  dataset: Dataset | undefined,
): Lib.Query | null {
  const metadata = useSelector(getMetadata);
  return useMemo(() => {
    const jsonQuery = dataset?.json_query;
    if (!jsonQuery) {
      return null;
    }
    try {
      return Lib.fromJsQueryAndMetadata(metadata, jsonQuery);
    } catch {
      return null;
    }
  }, [dataset, metadata]);
}
