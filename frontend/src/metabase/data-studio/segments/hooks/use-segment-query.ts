import { useMemo } from "react";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery } from "metabase-types/api";

type UseSegmentQueryResult = {
  query: Lib.Query | undefined;
  filters: Lib.FilterClause[];
};

export function useSegmentQuery(
  definition: DatasetQuery | null,
  metadata: Metadata,
): UseSegmentQueryResult {
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

  const filters = useMemo(() => (query ? Lib.filters(query, -1) : []), [query]);

  return { query, filters };
}
