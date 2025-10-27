import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { QueryTransformSource } from "metabase-types/api";

export function useSourceQuery(
  source: QueryTransformSource,
  onSourceChange: (newSource: QueryTransformSource) => void,
) {
  const metadata = useSelector(getMetadata);

  const query = useMemo(() => {
    const metadataProvider = Lib.metadataProvider(
      source.query.database,
      metadata,
    );
    return Lib.fromJsQuery(metadataProvider, source.query);
  }, [source, metadata]);

  const setQuery = (newQuery: Lib.Query) => {
    onSourceChange({ type: "query", query: Lib.toJsQuery(newQuery) });
  };

  return { query, setQuery };
}
