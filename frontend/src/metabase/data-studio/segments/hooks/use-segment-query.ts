import { useMemo } from "react";

import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

type UseSegmentQueryResult = {
  query: Lib.Query | undefined;
  filters: Lib.FilterClause[];
};

export function useSegmentQuery(
  definition: DatasetQuery | null,
): UseSegmentQueryResult {
  const metadataProvider = useMetadataProvider(definition?.database ?? null);
  const query = useMemo(() => {
    if (!definition?.database) {
      return undefined;
    }
    return Lib.fromJsQuery(metadataProvider, definition);
  }, [metadataProvider, definition]);

  const filters = useMemo(() => (query ? Lib.filters(query, -1) : []), [query]);

  return { query, filters };
}
