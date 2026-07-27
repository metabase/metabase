import { useMemo, useRef } from "react";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

import { useAdhocBreakoutQuery } from "../../metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { McpFilters } from "../query-utils";
import { buildTotalCountQuery } from "../query-utils";

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type Result = {
  /** First load, before the count has ever resolved — show a loader, never the empty state. */
  isInitialLoading: boolean;
  /** A subsequent load triggered by a filter change — let the charts show their own skeletons. */
  isRefetching: boolean;
  /** Whether the current (resolved) filters match any tool calls. */
  hasData: boolean;
  /** Total number of tool calls matching the current filters — drives the events pagination. */
  count: number;
};

/**
 * Runs a single count query over the filtered view to drive the page's load/empty/data states.
 * Distinguishes the initial load (loader) from a filter-change refetch (skeletons) so the page
 * never flashes the empty state before the first result has resolved.
 */
export function useMcpHasData({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  errorsOnly = false,
}: DataSources & McpFilters & { errorsOnly?: boolean }): Result {
  const query = useMemo(
    () =>
      provider && table && groupMembersTable
        ? buildTotalCountQuery({
            provider,
            table,
            groupMembersTable,
            dateFilter,
            userId,
            groupId,
            tenantId,
            errorsOnly,
          })
        : null,
    [
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      errorsOnly,
    ],
  );

  const { data, isFetching } = useAdhocBreakoutQuery(query);

  // Latch once the first count resolves; from then on a fetch is a refetch, not initial load.
  const hasLoadedOnce = useRef(false);
  const resolved = query != null && !isFetching && data != null;
  if (resolved) {
    hasLoadedOnce.current = true;
  }

  // The query is a single count aggregation with no breakout, so the result is exactly one row
  // with one column — the scalar total. `rows[0][0]` is that count.
  const count = Number(data?.data?.rows?.[0]?.[0] ?? 0);

  return {
    isInitialLoading: !hasLoadedOnce.current,
    isRefetching: hasLoadedOnce.current && isFetching,
    hasData: count > 0,
    count,
  };
}
