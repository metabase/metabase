import { t } from "ttag";
import _ from "underscore";

import type {
  ColumnRoles,
  PageviewRule,
  PathCleaningRule,
  UsersTableLink,
} from "metabase/event-tables";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import type { ExtraColumn, ProjectedColumn } from "./columns";
import {
  parseDateRange,
  serializeDateRange,
  widenDateRange,
} from "./date-range";
import { readEventQuery } from "./events/read-event-query";
import type { AllocatedEvent, EventDefinition } from "./events/types";
import {
  type AnalysisFilters,
  COLUMN_ROLE_FOR_GRAIN,
  cohortFilterClause,
  readFilterQuery,
} from "./filters";
import { findColumn, findColumnByRef } from "./find-column";
import type { AllocatedPeopleSegment } from "./segments/types";
import { ALL_HISTORY_DAYS, IN_RANGE_FLAG } from "./sql/analyses/lookback";
import { PAGEVIEW_FLAG } from "./sql/analyses/path-nodes";

const STAGE = -1;

const asFlag = (
  clause: Lib.ExpressionClause | Lib.FilterClause,
): Lib.ExpressionClause => Lib.expressionClause("case", [clause, 1, 0]);

/** The event's filters, ANDed, as a condition on the base query. */
const getEventFilter = (
  metadataProvider: Lib.MetadataProvider,
  event: EventDefinition,
): Lib.ExpressionClause | Lib.FilterClause => {
  const eventQuery = readEventQuery(metadataProvider, event);
  if (eventQuery === null) {
    throw new Error(t`The conditions for “${event.name}” can't be read.`);
  }
  const [first, ...rest] = Lib.filters(eventQuery, STAGE);
  if (first === undefined) {
    throw new Error(t`“${event.name}” has no conditions.`);
  }
  return rest.length === 0
    ? first
    : Lib.expressionClause("and", [first, ...rest]);
};

export type BaseQueryInput = {
  dateRange: string;
  columns: ColumnRoles;
  /** A rule on a column adds `PAGEVIEW_FLAG`. */
  pageviews: PageviewRule | null;
  /** Applied to the compiled SQL instead; see `BaseColumns`. */
  pathCleaning: readonly PathCleaningRule[];
  events: readonly AllocatedEvent[];
  extraColumns: readonly ExtraColumn[];
  /** Where the people segments' members are looked up. */
  usersTable: UsersTableLink | undefined;
  filters: AnalysisFilters;
  /**
   * The people segments in use, by flag. Who's in them comes from a query of
   * their own; see `BasePeopleSegments`.
   */
  peopleSegments: readonly AllocatedPeopleSegment[];
  /** Of the `peopleSegments` flags, the ones the people filters require. */
  requiredPeopleSegments: readonly string[];
  /**
   * Days of history to read before the date range, from `getLookbackDays`.
   * When it's more than 0, an `IN_RANGE_FLAG` column marks the events inside
   * the range. `ALL_HISTORY_DAYS` reads every event, after the range too.
   */
  lookbackDays: number;
};

export type BuiltBaseQuery = {
  query: Lib.Query;
  databaseId: number;
  extraColumns: ProjectedColumn[];
  /**
   * The 0/1 columns: one per event, `IN_RANGE_FLAG` with a lookback, and
   * `PAGEVIEW_FLAG` with a pageview rule on a column.
   */
  flags: string[];
};

export const getTableMetadata = (
  metadataProvider: Lib.MetadataProvider,
  tableId: TableId,
): Lib.TableMetadata | Lib.CardMetadata => {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (!tableMetadata) {
    throw new Error(`Table ${String(tableId)} is not in metadata yet`);
  }
  return tableMetadata;
};

/** Adds the filter query's filters, and limits each cohort to its ids. */
const applyFilters = (
  metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  filters: AnalysisFilters,
  columns: ColumnRoles,
): Lib.Query => {
  const filterQuery = readFilterQuery(metadataProvider, filters);
  if (filters.query !== null && filterQuery === null) {
    throw new Error(t`The filters can't be read.`);
  }
  let filtered = query;
  for (const filter of filterQuery ? Lib.filters(filterQuery, STAGE) : []) {
    filtered = Lib.filter(filtered, STAGE, filter);
  }
  for (const cohort of filters.cohorts) {
    const columnName = columns[COLUMN_ROLE_FOR_GRAIN[cohort.grain]];
    if (columnName === null) {
      throw new Error(
        t`“${cohort.label}” can't be applied, because this table has no session column.`,
      );
    }
    // An empty cohort matches nothing, rather than everything.
    const ids = cohort.ids.length > 0 ? cohort.ids : [""];
    filtered = Lib.filter(
      filtered,
      STAGE,
      cohortFilterClause(findColumn(filtered, columnName), { ...cohort, ids }),
    );
  }
  return filtered;
};

export type FilteredQueryInput = Pick<BaseQueryInput, "columns" | "filters"> & {
  /** Undefined: every event. */
  dateRange: string | undefined;
};

/** The date range widened by the lookback. Undefined: every event. */
const getReadRange = (
  dateRange: string,
  lookbackDays: number,
): string | undefined => {
  const dateFilter = parseDateRange(dateRange);
  if (lookbackDays === 0 || dateFilter === undefined) {
    return dateRange;
  }
  if (lookbackDays === ALL_HISTORY_DAYS) {
    return undefined;
  }
  return serializeDateRange(widenDateRange(dateFilter, lookbackDays));
};

/** A query on the event table, limited to the date range and the filters. */
export const buildFilteredQuery = (
  metadataProvider: Lib.MetadataProvider,
  tableMetadata: Lib.TableMetadata | Lib.CardMetadata,
  { dateRange, columns, filters }: FilteredQueryInput,
): Lib.Query => {
  let query = Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
  const dateFilter =
    dateRange !== undefined ? parseDateRange(dateRange) : undefined;
  if (dateFilter !== undefined && columns.timestamp !== null) {
    query = Lib.filter(
      query,
      STAGE,
      getDateFilterClause(findColumn(query, columns.timestamp), dateFilter),
    );
  }
  return applyFilters(metadataProvider, query, filters, columns);
};

/**
 * Lib query on the event table: the date range, a named 0/1 flag expression
 * per event in use, and an explicit field list so compiled aliases stay
 * stable. Columns keep their table names; `buildSql` renames them. An extra
 * column given by a field ref is an expression, so one through a foreign key
 * brings its implicit join.
 *
 * Flags are `case(filter, 1, 0)` rather than raw boolean expressions — Lib
 * custom expressions are typed, and a filter clause as an expression is the
 * spike we may revisit. 0/1 also lets `countIf(ev_n)` work in ClickHouse.
 */
export const buildBaseQuery = (
  metadataProvider: Lib.MetadataProvider,
  tableId: TableId,
  {
    dateRange,
    columns,
    pageviews,
    events,
    extraColumns,
    filters,
    lookbackDays,
  }: BaseQueryInput,
): BuiltBaseQuery => {
  const tableMetadata = getTableMetadata(metadataProvider, tableId);
  if (columns.timestamp === null) {
    throw new Error(t`This table has no event time column.`);
  }
  if (columns.person === null) {
    throw new Error(t`This table has no person column.`);
  }

  const hasLookback = lookbackDays > 0;
  const dateFilter = parseDateRange(dateRange);
  const readRange = getReadRange(dateRange, lookbackDays);

  // Cohorts are applied to the compiled SQL instead; see `BaseColumns`.
  let query = buildFilteredQuery(metadataProvider, tableMetadata, {
    dateRange: readRange,
    columns,
    filters: { ...filters, cohorts: [] },
  });

  if (hasLookback) {
    const timestamp = findColumn(query, columns.timestamp);
    // Without a date range, every event is in it.
    const inRange =
      dateFilter !== undefined
        ? getDateFilterClause(timestamp, dateFilter)
        : Lib.expressionClause("not-null", [timestamp]);
    query = Lib.expression(query, STAGE, IN_RANGE_FLAG, asFlag(inRange));
  }

  const referencedColumns = extraColumns.flatMap((extra) =>
    "fieldRef" in extra ? [extra] : [],
  );
  for (const { as, fieldRef } of referencedColumns) {
    query = Lib.expression(
      query,
      STAGE,
      as,
      Lib.expressionClause(findColumnByRef(query, fieldRef)),
    );
  }

  const hasPageviewFlag = pageviews?.type === "column_value";
  if (hasPageviewFlag) {
    const isPageview = Lib.expressionClause("=", [
      findColumn(query, pageviews.column),
      pageviews.value,
    ]);
    query = Lib.expression(query, STAGE, PAGEVIEW_FLAG, asFlag(isPageview));
  }

  for (const { flag, event } of events) {
    query = Lib.expression(
      query,
      STAGE,
      flag,
      asFlag(getEventFilter(metadataProvider, event)),
    );
  }

  const eventColumns = _.uniq([
    ...Object.values(columns).flatMap((column) => column ?? []),
    ...extraColumns.flatMap((extra) =>
      "column" in extra ? [extra.column] : [],
    ),
  ]);
  const flags = [
    ...events.map(({ flag }) => flag),
    ...(hasLookback ? [IN_RANGE_FLAG] : []),
    ...(hasPageviewFlag ? [PAGEVIEW_FLAG] : []),
  ];
  const selected = [
    ...eventColumns.map((name) => findColumn(query, name)),
    ...referencedColumns.map(({ as }) => findColumn(query, as)),
    ...flags.map((flag) => findColumn(query, flag)),
  ];
  query = Lib.withFields(query, STAGE, selected);

  const databaseId = Lib.databaseID(query);
  if (databaseId === null) {
    throw new Error("Base query has no database");
  }

  return {
    query,
    databaseId,
    extraColumns: extraColumns.map((extra) => ({
      as: extra.as,
      alias: "column" in extra ? extra.column : extra.as,
    })),
    flags,
  };
};
