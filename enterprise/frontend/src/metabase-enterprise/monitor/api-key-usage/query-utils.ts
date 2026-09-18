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
  apiKeyId?: number;
  userId?: number;
  groupId?: number;
};

type ApiKeyUsageDataSources = {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

// Name of the count aggregation column produced by `Lib.aggregateByCount`.
const COUNT_COLUMN = "count";

/**
 * Apply the shared API key/user/group filters to a query. The API key and user filters are plain
 * equality checks on columns the view already has; the group filter joins the audit
 * `v_group_members` view and filters by `group_id` (a user can belong to several groups). Each
 * no-ops when its id is unset.
 */
function applyScopeFilters(
  query: Query,
  {
    apiKeyId,
    userId,
    groupId,
  }: Pick<ApiKeyUsageFilters, "apiKeyId" | "userId" | "groupId">,
  groupMembersTable: TableMetadata | CardMetadata,
): Query {
  query = applyIdFilter(query, "api_key_id", apiKeyId);
  query = applyIdFilter(query, "user_id", userId);
  query = groupId != null ? joinGroupMembers(query, groupMembersTable) : query;
  query = groupId != null ? applyIdFilter(query, "group_id", groupId) : query;
  return query;
}

/**
 * The shared prelude every builder starts from: the view query with the date + scope
 * (API key/user/group) filters applied. Centralizing it keeps the filter handling in one place so
 * a builder can't silently drop a filter.
 */
function buildBaseQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  apiKeyId,
  userId,
  groupId,
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
  let query = Lib.queryFromTableOrCardMetadata(provider, table);
  query = applyDateFilter(query, dateFilter, "occurred_at");
  query = applyScopeFilters(
    query,
    { apiKeyId, userId, groupId },
    groupMembersTable,
  );
  return query;
}

/** Order an aggregated query by the count column descending (highest counts first). */
function orderByCountDesc(query: Query): Query {
  const countCol = findColumn(query, COUNT_COLUMN, Lib.orderableColumns);
  return countCol ? Lib.orderBy(query, 0, countCol, "desc") : query;
}

/** Add an `occurred_at` breakout bucketed by day (falls back to the raw column if the day bucket is unavailable). */
function breakoutByOccurredAtDay(query: Query): Query {
  const col = findColumn(query, "occurred_at", Lib.breakoutableColumns);
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
  apiKeyId,
  userId,
  groupId,
  breakoutColumn,
}: CountBreakoutQueryOpts): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    apiKeyId,
    userId,
    groupId,
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
  apiKeyId,
  userId,
  groupId,
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    apiKeyId,
    userId,
    groupId,
  });
  query = Lib.aggregateByCount(query, 0);
  query = breakoutByOccurredAtDay(query);
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
  apiKeyId,
  userId,
  groupId,
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    apiKeyId,
    userId,
    groupId,
  });
  query = Lib.aggregateByCount(query, 0);
  return query;
}

/** Add a MAX(occurred_at) aggregation, mirroring the shared module's `addSumAggregation`. */
function aggregateByMaxOccurredAt(query: Query): Query {
  const operators = Lib.availableAggregationOperators(query, 0);
  const maxOperator = operators.find(
    (operator) => Lib.displayInfo(query, 0, operator).shortName === "max",
  );
  if (!maxOperator) {
    return query;
  }
  const column = Lib.aggregationOperatorColumns(maxOperator).find(
    (col) =>
      Lib.displayInfo(query, 0, col).name?.toLowerCase() === "occurred_at",
  );
  return column
    ? Lib.aggregate(query, 0, Lib.aggregationClause(maxOperator, column))
    : query;
}

/**
 * Build a "most recent activity per API key" query: one row per key with at least one call
 * matching the current filters, breaking out by `api_key_id` and aggregating its latest
 * `occurred_at`. Used to scope the Key activity table's rows — and its "Last used" column — to
 * the same date/API key/user/group filters as the rest of the page.
 */
export function buildKeyActivityQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  apiKeyId,
  userId,
  groupId,
}: ApiKeyUsageFilters & ApiKeyUsageDataSources): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    apiKeyId,
    userId,
    groupId,
  });
  query = breakoutByColumn(query, "api_key_id");
  query = aggregateByMaxOccurredAt(query);
  return query;
}

export const API_KEY_USAGE_EVENT_SORT_COLUMNS = [
  "log_id",
  "occurred_at",
  "route_template",
  "http_method",
  "status",
  "duration_ms",
  "api_key_name",
  "user_display_name",
  "client_display_name",
  "embedding_client",
  "embedding_hostname",
  "ip_address",
] as const;

export type ApiKeyUsageEventSortColumn =
  (typeof API_KEY_USAGE_EVENT_SORT_COLUMNS)[number];

// Columns in API_KEY_USAGE_EVENT_SORT_COLUMNS that only show up when PII retention is on.
const PII_ONLY_COLUMNS: ApiKeyUsageEventSortColumn[] = ["ip_address"];

export function apiKeyUsageEventColumnKeys(
  hasPii: boolean,
): ApiKeyUsageEventSortColumn[] {
  return API_KEY_USAGE_EVENT_SORT_COLUMNS.filter(
    (column) => hasPii || !PII_ONLY_COLUMNS.includes(column),
  );
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

function projectToEventColumns(query: Query, hasPii: boolean): Query {
  const fields = apiKeyUsageEventColumnKeys(hasPii)
    .map((name) => findColumn(query, name, Lib.fieldableColumns))
    .filter((column): column is ColumnMetadata => column != null);
  return Lib.withFields(query, 0, fields);
}

type EventsQueryOpts = ApiKeyUsageFilters &
  ApiKeyUsageDataSources & {
    sortColumn?: ApiKeyUsageEventSortColumn;
    sortDirection?: SortDirection;
    hasPii: boolean;
  };

export function buildEventsQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  apiKeyId,
  userId,
  groupId,
  sortColumn = "occurred_at",
  sortDirection = "desc",
  hasPii,
}: EventsQueryOpts): Query {
  let query = buildBaseQuery({
    provider,
    table,
    groupMembersTable,
    dateFilter,
    apiKeyId,
    userId,
    groupId,
  });

  query = orderByColumn(query, sortColumn, sortDirection);
  query = orderByColumn(query, "log_id", "desc");
  query = projectToEventColumns(query, hasPii);

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
