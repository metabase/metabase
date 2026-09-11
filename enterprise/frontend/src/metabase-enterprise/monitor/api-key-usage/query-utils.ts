import type { DateFilterValue } from "metabase/querying/common/types";
import {
  applyDateFilter,
  applyIdFilter,
  breakoutByColumn,
  findColumn,
  joinGroupMembers,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/query-utils";
import type {
  CardMetadata,
  ColumnMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import type { SortDirection } from "metabase-types/api";

export type ApiKeyUsageFilters = {
  dateFilter: DateFilterValue;
  userId?: number;
  groupId?: number;
  tenantId?: number;
};

type ApiKeyUsageDataSources = {
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
  }: Pick<ApiKeyUsageFilters, "userId" | "groupId" | "tenantId">,
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
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
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

type CountBreakoutQueryOpts = ApiKeyUsageFilters &
  ApiKeyUsageDataSources & {
    breakoutColumn: string;
  };

/**
 * Build a "count of calls grouped by `breakoutColumn`" query (filtered + ordered by count desc).
 * Used by the single-breakout charts — calls by client, by route, by user.
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

/**
 * Build a "calls per day" query — a single-series time series of the total call count. Used by
 * the "Calls over time" chart.
 */
export function buildCallsByDayQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
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
  return query;
}

/**
 * Build a single-number count over the filtered view, used to decide whether the page has any
 * data to show (so we can render one empty state instead of a grid of empty charts).
 */
export function buildTotalCountQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
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
  return query;
}

export const API_KEY_USAGE_EVENT_SORT_COLUMNS = [
  "log_id",
  "created_at",
  "route_template",
  "http_method",
  "status",
  "duration_ms",
  "api_key_name",
  "user_display_name",
  "client_display_name",
  "embedding_client",
  "embedding_hostname",
  "tenant_name",
  "ip_address",
] as const;

export type ApiKeyUsageEventSortColumn =
  (typeof API_KEY_USAGE_EVENT_SORT_COLUMNS)[number];

export function apiKeyUsageEventColumnKeys(
  hasTenants: boolean,
  hasPii: boolean,
): ApiKeyUsageEventSortColumn[] {
  return [
    "log_id",
    "created_at",
    "route_template",
    "http_method",
    "status",
    "duration_ms",
    "api_key_name",
    "user_display_name",
    "client_display_name",
    "embedding_client",
    "embedding_hostname",
    ...(hasTenants ? (["tenant_name"] as const) : []),
    ...(hasPii ? (["ip_address"] as const) : []),
  ];
}

/** Append an order-by on `columnName` in `direction` if it's orderable. No-op if absent. */
function orderByColumn(
  query: Query,
  columnName: string,
  direction: "asc" | "desc",
): Query {
  const col = findColumn(query, columnName, Lib.orderableColumns);
  return col ? Lib.orderBy(query, 0, col, direction) : query;
}

function projectToEventColumns(
  query: Query,
  hasTenants: boolean,
  hasPii: boolean,
): Query {
  const fields = apiKeyUsageEventColumnKeys(hasTenants, hasPii)
    .map((name) => findColumn(query, name, Lib.fieldableColumns))
    .filter((column): column is ColumnMetadata => column != null);
  return Lib.withFields(query, 0, fields);
}

type EventsQueryOpts = ApiKeyUsageFilters &
  ApiKeyUsageDataSources & {
    sortColumn?: ApiKeyUsageEventSortColumn;
    sortDirection?: SortDirection;
    hasTenants: boolean;
    hasPii: boolean;
  };

export function buildEventsQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  sortColumn = "created_at",
  sortDirection = "desc",
  hasTenants,
  hasPii,
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

  query = orderByColumn(query, sortColumn, sortDirection);
  query = orderByColumn(query, "log_id", "desc");
  query = projectToEventColumns(query, hasTenants, hasPii);

  return query;
}

/**
 * Restrict the events query to a single page via the MBQL `:page` clause. `page` is 0-indexed
 * here; metabase-lib's `:page` is 1-indexed, so we add 1.
 */
export function paginateEventsQuery(
  query: Query,
  page: number,
  pageSize: number,
): Query {
  return Lib.withPage(query, 0, { page: page + 1, items: pageSize });
}
