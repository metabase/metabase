import type { DateFilterValue } from "metabase/querying/common/types";
import {
  applyDateFilter,
  applyIdFilter,
  breakoutByColumn,
  findColumn,
} from "metabase-enterprise/monitor/query-utils";
import * as Lib from "metabase-lib";
import type { SortDirection, SortingOptions } from "metabase-types/api";

// Previews record `data-app-preview` and are left out: that's the author trying the app.
const DATA_APP_EMBEDDING_CLIENT = "data-app";

// Not the view log: that one only mirrors question reads, while the query log has action runs too.
export const DATA_APP_LOG_VIEW = "v_query_log";

export const DATA_APP_LOG_ID_COLUMN = "entity_id";

const TIMESTAMP_COLUMN = "started_at";

// The wide query sits late so it doesn't push the rest out of sight.
export const DATA_APP_LOG_COLUMNS = [
  "started_at",
  "embedding_client_identifier",
  "user_id",
  // Only an action run records an action, so this tells the entity type.
  "action_id",
  "card_qualified_id",
  "action_qualified_id",
  "running_time_seconds",
  "result_rows",
  "database_qualified_id",
  "query",
  "metabase_version",
  "user_agent",
  "sanitized_user_agent",
  "ip_address",
  "error",
] as const;

export type DataAppLogColumn = (typeof DATA_APP_LOG_COLUMNS)[number];

const PII_COLUMNS: ReadonlySet<DataAppLogColumn> = new Set([
  "user_agent",
  "sanitized_user_agent",
  "ip_address",
]);

export function dataAppLogColumnKeys(hasPii: boolean): DataAppLogColumn[] {
  return DATA_APP_LOG_COLUMNS.filter(
    (column) => hasPii || !PII_COLUMNS.has(column),
  );
}

export const DEFAULT_SORTING: SortingOptions<DataAppLogColumn> = {
  sort_column: TIMESTAMP_COLUMN,
  sort_direction: "desc",
};

export const DATA_APP_ENTITY_TYPES = ["question", "action"] as const;

export type DataAppEntityType = (typeof DATA_APP_ENTITY_TYPES)[number];

export function parseDataAppEntityType(
  value: unknown,
): DataAppEntityType | null {
  return DATA_APP_ENTITY_TYPES.find((type) => type === value) ?? null;
}

export type DataAppLogFilters = {
  dateFilter: DateFilterValue;
  userId?: number;
  /** The data app's slug. */
  dataAppName?: string;
  entityType?: DataAppEntityType;
};

type DataAppLogSource = {
  provider: Lib.MetadataProvider;
  table: Lib.TableMetadata | Lib.CardMetadata;
};

const DATA_APP_LOG_FILTER_COLUMNS = [
  "embedding_client",
  "embedding_client_identifier",
  "action_id",
  TIMESTAMP_COLUMN,
  "user_id",
];

export function getMissingDataAppLogColumns({
  provider,
  table,
}: DataAppLogSource): string[] {
  const query = Lib.queryFromTableOrCardMetadata(provider, table);
  return DATA_APP_LOG_FILTER_COLUMNS.filter(
    (name) => findColumn(query, name, Lib.filterableColumns) === undefined,
  );
}

// Throws instead of skipping the filter: without it the log would show records it should leave out.
function findFilterColumn(
  query: Lib.Query,
  columnName: string,
): Lib.ColumnMetadata {
  const column = findColumn(query, columnName, Lib.filterableColumns);
  if (column === undefined) {
    throw new Error(`The query log has no ${columnName} column`);
  }
  return column;
}

function applyStringFilter(
  query: Lib.Query,
  columnName: string,
  values: string[],
): Lib.Query {
  const column = findFilterColumn(query, columnName);
  return Lib.filter(
    query,
    0,
    Lib.stringFilterClause({ operator: "=", column, values, options: {} }),
  );
}

export function scopeToDataApps(query: Lib.Query): Lib.Query {
  return applyStringFilter(query, "embedding_client", [
    DATA_APP_EMBEDDING_CLIENT,
  ]);
}

function applyEntityTypeFilter(
  query: Lib.Query,
  entityType: DataAppEntityType | undefined,
): Lib.Query {
  if (entityType === undefined) {
    return query;
  }
  const column = findFilterColumn(query, "action_id");
  return Lib.filter(
    query,
    0,
    Lib.defaultFilterClause({
      operator: entityType === "action" ? "not-null" : "is-null",
      column,
    }),
  );
}

function orderByColumn(
  query: Lib.Query,
  columnName: string,
  direction: SortDirection,
): Lib.Query {
  const column = findColumn(query, columnName, Lib.orderableColumns);
  return column ? Lib.orderBy(query, 0, column, direction) : query;
}

function buildBaseQuery({
  provider,
  table,
  dateFilter,
  userId,
  dataAppName,
  entityType,
}: DataAppLogSource & DataAppLogFilters): Lib.Query {
  let query = Lib.queryFromTableOrCardMetadata(provider, table);
  query = scopeToDataApps(query);
  query = applyDateFilter(query, dateFilter, TIMESTAMP_COLUMN);
  query = applyIdFilter(query, "user_id", userId);
  query =
    dataAppName === undefined
      ? query
      : applyStringFilter(query, "embedding_client_identifier", [dataAppName]);
  query = applyEntityTypeFilter(query, entityType);
  return query;
}

/** The slugs of the data apps with activity in the date range, removed apps included. */
export function buildLoggedDataAppsQuery({
  provider,
  table,
  dateFilter,
}: DataAppLogSource & Pick<DataAppLogFilters, "dateFilter">): Lib.Query {
  return breakoutByColumn(
    buildBaseQuery({ provider, table, dateFilter }),
    "embedding_client_identifier",
  );
}

export function buildDataAppLogCountQuery(
  opts: DataAppLogSource & DataAppLogFilters,
): Lib.Query {
  return Lib.aggregateByCount(buildBaseQuery(opts), 0);
}

type RowsQueryOpts = DataAppLogSource &
  DataAppLogFilters & {
    sorting: SortingOptions<DataAppLogColumn>;
    hasPii: boolean;
  };

export function buildDataAppLogRowsQuery({
  sorting,
  hasPii,
  ...opts
}: RowsQueryOpts): Lib.Query {
  let query = buildBaseQuery(opts);
  query = orderByColumn(query, sorting.sort_column, sorting.sort_direction);
  // Breaks ties, so pages can't skip or repeat rows.
  query = orderByColumn(query, DATA_APP_LOG_ID_COLUMN, "desc");
  const fields = [...dataAppLogColumnKeys(hasPii), DATA_APP_LOG_ID_COLUMN]
    .map((name) => findColumn(query, name, Lib.fieldableColumns))
    .filter((column): column is Lib.ColumnMetadata => column !== undefined);
  return Lib.withFields(query, 0, fields);
}
