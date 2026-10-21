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
import { parseDateRange } from "./date-range";
import { readEventQuery } from "./events/read-event-query";
import type { AllocatedEvent, EventDefinition } from "./events/types";
import { findColumn, findJoinedColumn } from "./find-column";

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
  /** Filters on the event table; see `CommonSettings["filters"]`. Absent means none. */
  filters?: EventDefinition | null;
  columns: ColumnRoles;
  events: readonly AllocatedEvent[];
  extraColumns: readonly ExtraColumn[];
  /** Needed when an extra column comes from the users table. */
  usersTable: UsersTableLink | undefined;
};

export type BuiltBaseQuery = {
  query: Lib.Query;
  databaseId: number;
  extraColumns: ProjectedColumn[];
};

const getTableMetadata = (
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
    filters = null,
    columns,
    events,
    extraColumns,
    usersTable,
  }: BaseQueryInput,
): BuiltBaseQuery => {
  const tableMetadata = getTableMetadata(metadataProvider, tableId);
  if (columns.timestamp === null) {
    throw new Error(t`Pick an event time column in Advanced settings.`);
  }
  if (columns.person === null) {
    throw new Error(t`Pick a person column in Advanced settings.`);
  }

  let query = Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata);

  const dateFilter = parseDateRange(dateRange);
  if (dateFilter !== undefined) {
    query = Lib.filter(
      query,
      STAGE,
      getDateFilterClause(findColumn(query, columns.timestamp), dateFilter),
    );
  }

  if (filters !== null) {
    const filtersQuery = readEventQuery(metadataProvider, filters);
    if (filtersQuery === null) {
      throw new Error(t`The filters can't be read.`);
    }
    for (const clause of Lib.filters(filtersQuery, STAGE)) {
      query = Lib.filter(query, STAGE, clause);
    }
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
  const selected = [
    ...eventColumns.map((name) => findColumn(query, name)),
    ...usersColumns.map(({ column }) => findJoinedColumn(query, column)),
    ...events.map(({ flag }) => findColumn(query, flag)),
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
  };
};
