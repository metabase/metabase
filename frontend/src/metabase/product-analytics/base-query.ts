import { t } from "ttag";
import _ from "underscore";

import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import { COLUMN_ROLES, type ColumnRoles } from "./columns";
import { parseDateRange } from "./date-range";
import type { AllocatedEvent } from "./events/types";
import { findColumn } from "./find-column";

const STAGE = -1;

const asFlag = (clause: Lib.ExpressionClause): Lib.ExpressionClause =>
  Lib.expressionClause("case", [clause, 1, 0]);

export type BaseQueryInput = {
  dateRange: string;
  columns: ColumnRoles;
  events: AllocatedEvent[];
};

export type BuiltBaseQuery = {
  query: Lib.Query;
  databaseId: number;
};

/**
 * Lib query on the event table: the date range, a named 0/1 flag expression
 * per event in use, and an explicit field list so compiled aliases stay
 * stable. Columns keep their table names; `buildSql` renames them.
 *
 * Flags are `case(filter, 1, 0)` rather than raw boolean expressions — Lib
 * custom expressions are typed, and a filter clause as an expression is the
 * spike we may revisit. 0/1 also lets `countIf(ev_n)` work in ClickHouse.
 */
export const buildBaseQuery = (
  metadataProvider: Lib.MetadataProvider,
  tableId: TableId,
  { dateRange, columns, events }: BaseQueryInput,
): BuiltBaseQuery => {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (!tableMetadata) {
    throw new Error(`Table ${String(tableId)} is not in metadata yet`);
  }
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

  for (const { flag, event } of events) {
    query = Lib.expression(
      query,
      STAGE,
      flag,
      asFlag(event.getFilter(query, columns)),
    );
  }

  const mappedColumns = _.uniq(
    COLUMN_ROLES.flatMap((role) => columns[role] ?? []),
  );
  const selected = [...mappedColumns, ...events.map(({ flag }) => flag)].map(
    (name) => findColumn(query, name),
  );
  query = Lib.withFields(query, STAGE, selected);

  const databaseId = Lib.databaseID(query);
  if (databaseId === null) {
    throw new Error("Base query has no database");
  }

  return { query, databaseId };
};
