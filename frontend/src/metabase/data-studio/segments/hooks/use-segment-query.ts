import { useMemo } from "react";

import { useMetadataProviderFactory } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

type UseSegmentQueryResult = {
  query: Lib.Query | undefined;
  filters: Lib.FilterClause[];
};

export function useSegmentQuery(
  definition: DatasetQuery | null,
): UseSegmentQueryResult {
  const getMetadataProvider = useMetadataProviderFactory();
  const query = useMemo(() => {
    if (!definition?.database) {
      return undefined;
    }
    const metadataProvider = getMetadataProvider(definition.database);
    return Lib.fromJsQuery(metadataProvider, definition);
  }, [getMetadataProvider, definition]);

  const filters = useMemo(() => (query ? Lib.filters(query, -1) : []), [query]);

  return { query, filters };
}
