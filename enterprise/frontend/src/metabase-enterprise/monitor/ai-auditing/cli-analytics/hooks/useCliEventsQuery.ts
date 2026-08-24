import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { paginateEventsQuery } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { Dataset } from "metabase-types/api";

type EventsPageResult = {
  data: Dataset | undefined;
  isFetching: boolean;
  error: unknown;
};

/**
 * Run the row-level events query for one page. Applies the MBQL `:page` clause (via
 * {@link paginateEventsQuery}) before execution so the backend returns only the requested page.
 * `page` is 0-indexed.
 */
export function useCliEventsQuery(
  query: Query | null,
  page: number,
  pageSize: number,
): EventsPageResult {
  const jsQuery = useMemo(
    () =>
      query ? Lib.toJsQuery(paginateEventsQuery(query, page, pageSize)) : null,
    [query, page, pageSize],
  );

  const { data, isFetching, error } = useGetAdhocQueryQuery(
    jsQuery ?? skipToken,
  );

  return { data, isFetching, error };
}
