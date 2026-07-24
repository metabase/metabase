import { useMemo } from "react";

import { skipToken, useLazyGetAdhocQueryQuery } from "metabase/api";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
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
 *
 * Uses `useAbortableQuery` so switching pages before a request resolves
 * aborts the stale one instead of letting it complete in the background.
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

  const { data, isFetching } = useAbortableQuery(
    useLazyGetAdhocQueryQuery,
    jsQuery ?? skipToken,
  );

  return { data, isFetching };
}
