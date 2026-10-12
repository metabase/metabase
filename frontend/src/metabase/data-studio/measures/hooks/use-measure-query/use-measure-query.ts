import { useMemo } from "react";

import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

type UseMeasureQueryResult = {
  query: Lib.Query | undefined;
  aggregations: Lib.AggregationClause[];
};

export function useMeasureQuery(
  definition: DatasetQuery | null,
): UseMeasureQueryResult {
  const metadataProvider = useMetadataProvider(definition?.database ?? null);
  const query = useMemo(() => {
    if (!definition?.database) {
      return undefined;
    }
    return Lib.fromJsQuery(metadataProvider, definition);
  }, [metadataProvider, definition]);

  const aggregations = useMemo(
    () => (query ? Lib.aggregations(query, -1) : []),
    [query],
  );

  return { query, aggregations };
}
