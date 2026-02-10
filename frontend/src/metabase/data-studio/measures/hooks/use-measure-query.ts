import { useMemo } from "react";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery } from "metabase-types/api";

type UseMeasureQueryResult = {
  query: Lib.Query | undefined;
  aggregations: Lib.AggregationClause[];
};

export function useMeasureQuery(
  definition: DatasetQuery | null,
  metadata: Metadata,
): UseMeasureQueryResult {
  const query = useMemo(() => {
    if (!definition?.database) {
      return undefined;
    }
    const metadataProvider = Lib.metadataProvider(
      definition.database,
      metadata,
    );
    return Lib.fromJsQuery(metadataProvider, definition);
  }, [metadata, definition]);

  const aggregations = useMemo(
    () => (query ? Lib.aggregations(query, -1) : []),
    [query],
  );

  return { query, aggregations };
}
