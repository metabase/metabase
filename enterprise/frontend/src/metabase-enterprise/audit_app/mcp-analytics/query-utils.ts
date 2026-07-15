import type { DateFilterValue } from "metabase/querying/common/types";
import type {
  CardMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";

import {
  applyDateFilter,
  applyIdFilter,
  breakoutByColumn,
  findColumn,
  joinGroupMembers,
} from "../metabot-analytics/components/ConversationStatsPage/query-utils";

export type McpFilters = {
  dateFilter: DateFilterValue;
  userId?: number;
  groupId?: number;
  tenantId?: number;
};

type McpDataSources = {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

// Name of the count aggregation column produced by `Lib.aggregateByCount`.
const COUNT_COLUMN = "count";

/**
 * Apply the shared user/group/tenant filters to a query. The group filter joins the audit
 * `v_group_members` view and filters by `group_id` (a user can belong to several groups); the
 * user and tenant filters are plain `user_id` / `tenant_id` equalities. Each no-ops when its id
 * is unset.
 */
function applyScopeFilters(
  query: Query,
  {
    userId,
    groupId,
    tenantId,
  }: Pick<McpFilters, "userId" | "groupId" | "tenantId">,
  groupMembersTable: TableMetadata | CardMetadata,
): Query {
  query = applyIdFilter(query, "user_id", userId);
  query = applyIdFilter(query, "tenant_id", tenantId);
  query = groupId != null ? joinGroupMembers(query, groupMembersTable) : query;
  query = groupId != null ? applyIdFilter(query, "group_id", groupId) : query;
  return query;
}

/**
 * The shared prelude every builder starts from: the view query with the date + scope
 * (user/group/tenant) filters applied. Centralizing it keeps the filter handling — notably
 * `tenantId` — in one place so a builder can't silently drop a filter.
 */
function buildBaseQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
}: McpFilters & McpDataSources): Query {
  let query = Lib.queryFromTableOrCardMetadata(provider, table);
  query = applyDateFilter(query, dateFilter);
  query = applyScopeFilters(
    query,
    { userId, groupId, tenantId },
    groupMembersTable,
  );
  return query;
}

/** Order an aggregated query by the count column descending (highest counts first). */
function orderByCountDesc(query: Query): Query {
  const countCol = findColumn(query, COUNT_COLUMN, Lib.orderableColumns);
  return countCol ? Lib.orderBy(query, 0, countCol, "desc") : query;
}

/** Filter a query to rows whose `status` equals `status` (e.g. "error"). No-op if absent. */
function applyStatusFilter(query: Query, status: string): Query {
  const col = findColumn(query, "status", Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.stringFilterClause({
      operator: "=",
      column: col,
      values: [status],
      options: {},
    }),
  );
}

type CountBreakoutQueryOpts = McpFilters &
  McpDataSources & {
    breakoutColumn: string;
  };

/**
 * Build a "count of tool calls grouped by `breakoutColumn`" query (filtered + ordered by
 * count desc). Used by the single-breakout charts — calls by tool, by user, etc.
 */
export function buildCountBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  breakoutColumn,
}: CountBreakoutQueryOpts): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
  });
  query = Lib.aggregateByCount(query, 0);
  query = breakoutByColumn(query, breakoutColumn);
  query = orderByCountDesc(query);
  return query;
}

/** Add a `created_at` breakout bucketed by day (falls back to the raw column if the day bucket is unavailable). */
function breakoutByCreatedAtDay(query: Query): Query {
  const col = findColumn(query, "created_at", Lib.breakoutableColumns);
  if (!col) {
    return query;
  }
  const dayBucket = Lib.availableTemporalBuckets(query, 0, col).find(
    (bucket) => Lib.displayInfo(query, 0, bucket).shortName === "day",
  );
  const bucketed = dayBucket ? Lib.withTemporalBucket(col, dayBucket) : col;
  return Lib.breakout(query, 0, bucketed);
}

/**
 * Build a "calls per day, broken out by client" query — a multi-series time series. The day
 * breakout is added first so it becomes the x-axis dimension and `client_display_name` becomes
 * the series (one line per client).
 */
export function buildCallsByDayByClientQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
}: McpFilters & McpDataSources): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
  });
  query = Lib.aggregateByCount(query, 0);
  query = breakoutByCreatedAtDay(query);
  query = breakoutByColumn(query, "client_display_name");
  return query;
}

/**
 * Build a "calls per day, broken out by status" query — a multi-series time series (one line
 * per status) that surfaces the error-vs-success trend over time.
 */
export function buildCallsByDayByStatusQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
}: McpFilters & McpDataSources): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
  });
  query = Lib.aggregateByCount(query, 0);
  query = breakoutByCreatedAtDay(query);
  query = breakoutByColumn(query, "status");
  return query;
}

type ErrorBreakoutQueryOpts = McpFilters &
  McpDataSources & {
    breakoutColumn: string;
  };

/**
 * Build a "count of failed tool calls grouped by `breakoutColumn`" query (filtered to
 * `status = error`, ordered by count desc). Used by the error breakdown charts — by tool, by
 * error type.
 */
export function buildErrorBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  breakoutColumn,
}: ErrorBreakoutQueryOpts): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
  });
  query = applyStatusFilter(query, "error");
  query = Lib.aggregateByCount(query, 0);
  query = breakoutByColumn(query, breakoutColumn);
  query = orderByCountDesc(query);
  return query;
}

/**
 * Build a single-number count over the filtered view, used to decide whether the page has any
 * data to show (so we can render one empty state instead of a grid of empty charts). When
 * `errorsOnly` is set, counts only failed calls (drives the errors-section visibility).
 */
export function buildTotalCountQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  errorsOnly = false,
}: McpFilters & McpDataSources & { errorsOnly?: boolean }): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
  });
  query = errorsOnly ? applyStatusFilter(query, "error") : query;
  query = Lib.aggregateByCount(query, 0);
  return query;
}

type EventsQueryOpts = McpFilters &
  McpDataSources & {
    limit: number;
  };

/**
 * Build the row-level events query for the Events tab: the filtered view with no aggregation,
 * ordered by `created_at` descending and capped at `limit` rows.
 */
export function buildEventsQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  limit,
}: EventsQueryOpts): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
  });

  const createdAt = findColumn(query, "created_at", Lib.orderableColumns);
  if (createdAt) {
    query = Lib.orderBy(query, 0, createdAt, "desc");
  }

  query = Lib.limit(query, 0, limit);
  return query;
}
