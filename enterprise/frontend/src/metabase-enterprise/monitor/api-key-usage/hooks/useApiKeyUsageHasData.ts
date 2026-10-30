import { useMemo, useRef } from "react";

import { useListApiKeysQuery } from "metabase/admin/settings/api/api-key";
import { useAdhocBreakoutQuery } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { ApiKeyUsageFilters } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import {
  apiKeyMatchesScope,
  buildTotalCountQuery,
} from "metabase-enterprise/monitor/api-key-usage/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
  /** Whether the `table`/`groupMembersTable` lookup itself (view name -> table metadata) is
   * still resolving — distinct from the data queries below, which only start once this settles.
   * Without this, a view the audit db hasn't synced yet would leave `table` null and `query`
   * null forever, and the page would spin forever with no escape hatch. */
  isLoadingTables: boolean;
};

type ResolvedArgs = {
  /** Whether the `table`/`groupMembersTable` lookup itself is still resolving. */
  isLoadingTables: boolean;
  isFetching: boolean;
  isFetchingKeys: boolean;
  /** Null means either still loading the tables, or the tables were never found. */
  query: unknown;
  data: unknown;
  apiKeys: unknown;
  hasError: boolean;
};

/**
 * Whether every input this hook depends on has settled, one way or another. Once the table
 * lookup is done, a still-null `query` means the view genuinely isn't there to query (nothing
 * more to wait for) rather than still loading — treated the same as a resolved, empty count.
 * Without that distinction, a view the audit db hasn't synced yet would leave `query` null
 * forever, and the page would spin forever with no escape hatch.
 */
export function isResolved({
  isLoadingTables,
  isFetching,
  isFetchingKeys,
  query,
  data,
  apiKeys,
  hasError,
}: ResolvedArgs): boolean {
  return (
    !isLoadingTables &&
    !isFetching &&
    !isFetchingKeys &&
    apiKeys !== undefined &&
    (query === null || data !== undefined || hasError)
  );
}

type Result = {
  /** First load, before the count has ever resolved — show a loader, never the empty state. */
  isInitialLoading: boolean;
  /** A subsequent load triggered by a filter change — let the charts show their own skeletons. */
  isRefetching: boolean;
  /** Whether the current (resolved) filters match any API keys — regardless of their usage. */
  hasData: boolean;
  /** Total number of calls matching the current filters — drives the events pagination. */
  count: number;
  /** Set when the count query itself failed (e.g. a 500) — the page should show an error, not spin forever. */
  error: unknown;
  /** The table lookup settled, but found no table to query at all (the audit db hasn't synced the
   * view). The charts and tables below this page can't do anything with a null table either — they
   * just sit on their own skeletons forever — so the caller should show the empty/error state
   * instead of rendering them, regardless of `hasData`. */
  tablesMissing: boolean;
};

/**
 * Drives the page's load/empty/data states. "Has data" means at least one API key matches the
 * current API key/user/group filters, or the filtered call count is nonzero — independent of
 * whether a *matching* key currently has usage, so the Key activity table can still show a key
 * with no activity instead of the page going empty, and a deleted key's history stays reachable
 * (see `count > 0` below). Still runs the filtered total-count query, since the Events tab's
 * pagination needs it. Distinguishes the initial load (loader) from a filter-change refetch
 * (skeletons) so the page never flashes the empty state before the first result has resolved.
 */
export function useApiKeyUsageHasData({
  provider,
  table,
  groupMembersTable,
  isLoadingTables,
  dateFilter,
  apiKeyId,
  userId,
  groupId,
}: DataSources & ApiKeyUsageFilters): Result {
  const query = useMemo(
    () =>
      provider && table && groupMembersTable
        ? buildTotalCountQuery({
            provider,
            table,
            groupMembersTable,
            dateFilter,
            apiKeyId,
            userId,
            groupId,
          })
        : null,
    [provider, table, groupMembersTable, dateFilter, apiKeyId, userId, groupId],
  );

  const { data, isFetching, error } = useAdhocBreakoutQuery(query);
  const {
    data: apiKeys,
    isFetching: isFetchingKeys,
    error: keysError,
  } = useListApiKeysQuery();

  // Latch once the first count resolves (successfully or not); from then on a fetch is a
  // refetch, not initial load.
  const hasLoadedOnce = useRef(false);
  const combinedError = error ?? keysError;
  const hasError = combinedError != null;
  const resolved = isResolved({
    isLoadingTables,
    isFetching,
    isFetchingKeys,
    query,
    data,
    apiKeys,
    hasError,
  });
  if (resolved) {
    hasLoadedOnce.current = true;
  }

  // The query is a single count aggregation with no breakout, so the result is exactly one row
  // with one column — the scalar total. `rows[0][0]` is that count.
  const count = Number(data?.data?.rows?.[0]?.[0] ?? 0);
  // `count > 0` keeps a deleted key's history reachable: once no live key matches the filters,
  // nothing in `apiKeys` can match either, but the usage log rows (and the key's name on them)
  // still exist and still match the filters' date range.
  const hasData =
    count > 0 ||
    (apiKeys?.some((apiKey) =>
      apiKeyMatchesScope(apiKey, { apiKeyId, userId, groupId }),
    ) ??
      false);

  const tablesMissing =
    !isLoadingTables &&
    (provider == null || table == null || groupMembersTable == null);

  return {
    isInitialLoading: !hasLoadedOnce.current,
    isRefetching: hasLoadedOnce.current && (isFetching || isFetchingKeys),
    hasData,
    count,
    error: combinedError,
    tablesMissing,
  };
}
