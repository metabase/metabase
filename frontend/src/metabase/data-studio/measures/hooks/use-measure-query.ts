import { useMemo } from "react";

import { useMetadataProviderFactory } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

type UseMeasureQueryResult = {
  query: Lib.Query | undefined;
  aggregations: Lib.AggregationClause[];
};

export function useMeasureQuery(
  definition: DatasetQuery | null,
): UseMeasureQueryResult {
  const getMetadataProvider = useMetadataProviderFactory();
  const query = useMemo(() => {
    if (!definition?.database) {
      return undefined;
    }
    const metadataProvider = getMetadataProvider(definition.database);
    return Lib.fromJsQuery(metadataProvider, definition);
  }, [getMetadataProvider, definition]);

  const aggregations = useMemo(
    () => (query ? Lib.aggregations(query, -1) : []),
    [query],
  );

  return { query, aggregations };
}
