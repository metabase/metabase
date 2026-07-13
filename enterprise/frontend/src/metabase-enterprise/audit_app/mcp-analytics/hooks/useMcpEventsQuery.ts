import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { Dataset, LegacyDatasetQuery } from "metabase-types/api";

import { withEventsPage } from "../query-utils";

type EventsPageResult = {
  data: Dataset | undefined;
  jsQuery: LegacyDatasetQuery | null;
  isFetching: boolean;
};

/**
 * Run the row-level events query for one page. Mirrors `useAdhocBreakoutQuery` but injects the
 * MBQL `:page` clause (via {@link withEventsPage}) before execution so the backend returns only
 * the requested page — metabase-lib has no offset/page API, so pagination can't live in the Lib
 * query itself. `page` is 0-indexed.
 */
export function useMcpEventsQuery(
  query: Query | null,
  page: number,
  pageSize: number,
): EventsPageResult {
  const jsQuery = useMemo(
    () =>
      query ? withEventsPage(Lib.toLegacyQuery(query), page, pageSize) : null,
    [query, page, pageSize],
  );

  const { data, isFetching } = useGetAdhocQueryQuery(
    jsQuery ?? ({} as LegacyDatasetQuery),
    { skip: !jsQuery },
  );

  return { data, jsQuery, isFetching };
}
