import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";

import { paginateEventsQuery } from "../query-utils";

type EventsPageResult = {
  data: Dataset | undefined;
  isFetching: boolean;
};

/**
 * Run the row-level events query for one page. Applies the MBQL `:page` clause (via
 * {@link paginateEventsQuery}) before execution so the backend returns only the requested page.
 * `page` is 0-indexed.
 */
export function useMcpEventsQuery(
  query: Query | null,
  page: number,
  pageSize: number,
): EventsPageResult {
  const jsQuery = useMemo(
    () =>
      query ? Lib.toJsQuery(paginateEventsQuery(query, page, pageSize)) : null,
    [query, page, pageSize],
  );

  const { data, isFetching } = useGetAdhocQueryQuery(jsQuery ?? skipToken);

  return { data, isFetching };
}
