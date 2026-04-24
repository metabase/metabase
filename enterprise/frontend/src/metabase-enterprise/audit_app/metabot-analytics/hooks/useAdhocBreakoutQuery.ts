import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

type AdhocQueryResult = {
  data: ReturnType<typeof useGetAdhocQueryQuery>["data"];
  jsQuery: DatasetQuery | null;
  isFetching: boolean;
};

export function useAdhocBreakoutQuery(query: Query | null): AdhocQueryResult {
  const jsQuery = useMemo(
    () => (query ? (Lib.toJsQuery(query) as DatasetQuery) : null),
    [query],
  );

  const { data, isFetching } = useGetAdhocQueryQuery(
    jsQuery ?? ({} as DatasetQuery),
    { skip: !jsQuery },
  );

  return { data, jsQuery, isFetching };
}
