import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import {
  type TabCountState,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import { DEFAULT_DATE_FILTER } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters/useFilterOptions";
import { applyDateFilter } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/query-utils";
import type { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import * as Lib from "metabase-lib";

/**
 * Counts an audit view's rows in the default 30-day date window, ignoring the
 * section's optional filters. Call it from a persistent section layout: the
 * count refreshes on section entry and when ad-hoc dataset tags are invalidated.
 * Missing audit metadata, failed queries, and non-count results hide the badge.
 */
export function useAuditRowCount(
  {
    provider,
    table,
    isLoading,
    error: metadataError,
  }: ReturnType<typeof useAuditTable>,
  {
    dateColumn = "created_at",
  }: { dateColumn?: "created_at" | "occurred_at" } = {},
): TabCountState {
  const query = useMemo(() => {
    if (!provider || !table) {
      return null;
    }
    const query = applyDateFilter(
      Lib.queryFromTableOrCardMetadata(provider, table),
      DEFAULT_DATE_FILTER,
      dateColumn,
    );
    // Legacy MBQL keeps this scalar query's cache key stable across metadata UUID changes.
    return Lib.toLegacyQuery(Lib.aggregateByCount(query, 0));
  }, [provider, table, dateColumn]);
  const { currentData: data, error } = useGetAdhocQueryQuery(
    query ?? skipToken,
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const value = data?.data?.rows?.[0]?.[0];
  const isValidCount =
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const isError =
    metadataError != null ||
    error !== undefined ||
    (!isLoading && query === null) ||
    (data !== undefined &&
      (!isValidCount || data.error != null || data.status === "failed"));

  return getTabCount({
    value: isValidCount ? value : undefined,
    isError,
  });
}
