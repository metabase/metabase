import { t } from "ttag";
import _ from "underscore";

import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import {
  COLUMN_ROLES,
  type ColumnRoles,
  type ExtraColumn,
  type ProjectedColumn,
  type UsersTableLink,
} from "./columns";
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
import { findColumn, findJoinedColumn } from "./find-column";
import type { AllocatedPeopleSegment } from "./segments/types";
import { IN_RANGE_FLAG } from "./sql/analyses/lookback";

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
    throw new Error(t`The conditions for ${event.name} can't be read.`);
  }
  const [first, ...rest] = Lib.filters(eventQuery, STAGE);
  if (first === undefined) {
    throw new Error(t`${event.name} has no conditions.`);
  }
  return rest.length === 0
    ? first
    : Lib.expressionClause("and", [first, ...rest]);
};

export type BaseQueryInput = {
  dateRange: string;
  columns: ColumnRoles;
  events: readonly AllocatedEvent[];
  extraColumns: readonly ExtraColumn[];
  /** Needed when an extra column comes from the users table. */
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
   * the range.
   */
  lookbackDays: number;
};

export type BuiltBaseQuery = {
  query: Lib.Query;
  databaseId: number;
  extraColumns: ProjectedColumn[];
  /** The 0/1 columns: one per event, and `IN_RANGE_FLAG` with a lookback. */
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

const findJoinStrategy = (
  query: Lib.Query,
  shortName: string,
): Lib.JoinStrategy => {
  const strategy = Lib.availableJoinStrategies(query, STAGE).find(
    (item) => Lib.displayInfo(query, STAGE, item).shortName === shortName,
  );
  if (strategy === undefined) {
    throw new Error(`Join strategy ${shortName} is not available`);
  }
  return strategy;
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
        t`Pick a column for “${cohort.label}” in Advanced settings.`,
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

export type FilteredQueryInput = Pick<
  BaseQueryInput,
  "dateRange" | "columns" | "filters"
>;

/** A query on the event table, limited to the date range and the filters. */
export const buildFilteredQuery = (
  metadataProvider: Lib.MetadataProvider,
  tableMetadata: Lib.TableMetadata | Lib.CardMetadata,
  { dateRange, columns, filters }: FilteredQueryInput,
): Lib.Query => {
  let query = Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);
  const dateFilter = parseDateRange(dateRange);
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
 * Left-joins the users table on the person column, bringing in only
 * `columns`. Returns the join's alias.
 */
const joinUsersTable = (
  metadataProvider: Lib.MetadataProvider,
  query: Lib.Query,
  usersTable: UsersTableLink,
  columns: readonly string[],
): { query: Lib.Query; alias: string } => {
  const usersMetadata = getTableMetadata(metadataProvider, usersTable.tableId);
  const joinedFields = columns.map((name) => {
    const column = Lib.joinableColumns(query, STAGE, usersMetadata).find(
      (item) => Lib.displayInfo(query, STAGE, item).name === name,
    );
    if (column === undefined) {
      throw new Error(`Column ${name} not found`);
    }
    return column;
  });
  const foreignKey = findColumn(query, usersTable.foreignKey);
  const primaryKey = Lib.joinConditionRHSColumns(
    query,
    STAGE,
    usersMetadata,
    foreignKey,
  ).find(
    (column) =>
      Lib.displayInfo(query, STAGE, column).name === usersTable.primaryKey,
  );
  if (primaryKey === undefined) {
    throw new Error(`Column ${usersTable.primaryKey} not found`);
  }
  const condition = Lib.joinConditionClause("=", foreignKey, primaryKey);
  const clause = Lib.joinClause(
    usersMetadata,
    [condition],
    findJoinStrategy(query, "left-join"),
  );
  const joined = Lib.join(
    query,
    STAGE,
    Lib.withJoinFields(clause, joinedFields),
  );
  const join = Lib.joins(joined, STAGE).at(-1);
  if (join === undefined) {
    throw new Error("The users table join was not added");
  }
  return { query: joined, alias: Lib.displayInfo(joined, STAGE, join).name };
};

/**
 * Lib query on the event table: the date range, a named 0/1 flag expression
 * per event in use, and an explicit field list so compiled aliases stay
 * stable. Columns keep their table names; `buildSql` renames them. Extra
 * columns from the users table are left-joined in through the person column.
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
    events,
    extraColumns,
    usersTable,
    filters,
    lookbackDays,
  }: BaseQueryInput,
): BuiltBaseQuery => {
  const tableMetadata = getTableMetadata(metadataProvider, tableId);
  if (columns.timestamp === null) {
    throw new Error(t`Pick an event time column in Advanced settings.`);
  }
  if (columns.person === null) {
    throw new Error(t`Pick a person column in Advanced settings.`);
  }

  const hasLookback = lookbackDays > 0;
  const dateFilter = parseDateRange(dateRange);
  const readRange =
    hasLookback && dateFilter !== undefined
      ? serializeDateRange(widenDateRange(dateFilter, lookbackDays))
      : dateRange;

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

  const usersColumns = extraColumns.filter(({ from }) => from === "users");
  let usersJoinAlias: string | undefined;
  if (usersColumns.length > 0) {
    if (usersTable === undefined) {
      throw new Error(t`The person column doesn't link to a users table.`);
    }
    ({ query, alias: usersJoinAlias } = joinUsersTable(
      metadataProvider,
      query,
      usersTable,
      usersColumns.map(({ column }) => column),
    ));
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
    ...COLUMN_ROLES.flatMap((role) => columns[role] ?? []),
    ...extraColumns
      .filter(({ from }) => from === "events")
      .map(({ column }) => column),
  ]);
  const flags = [
    ...events.map(({ flag }) => flag),
    ...(hasLookback ? [IN_RANGE_FLAG] : []),
  ];
  const selected = [
    ...eventColumns.map((name) => findColumn(query, name)),
    ...usersColumns.map(({ column }) => findJoinedColumn(query, column)),
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
    extraColumns: extraColumns.map(({ as, column, from }) => ({
      as,
      // The query processor aliases a joined column as `<join alias>__<name>`.
      alias:
        from === "users" && usersJoinAlias !== undefined
          ? `${usersJoinAlias}__${column}`
          : column,
    })),
    flags,
  };
};
