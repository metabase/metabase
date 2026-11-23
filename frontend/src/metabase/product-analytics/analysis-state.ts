import { getColumnRoleValue } from "metabase/product-analytics-core";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import type {
  EventTableColumnRole,
  ProductAnalyticsKind,
  Table,
} from "metabase-types/api";

import type { AnalysisSettingsByKind } from "./analyses/types";
import { parseDateRange } from "./date-range";

type AnalysisStateOptions<K extends ProductAnalyticsKind> = {
  kind: K;
  settings: AnalysisSettingsByKind[K];
  table: Table;
  metadataProvider: Lib.MetadataProvider;
};

const STAGE_INDEX = -1;

function getRoleColumn(
  query: Lib.Query,
  table: Table,
  role: EventTableColumnRole,
): Lib.ColumnMetadata {
  const columnName = getColumnRoleValue(table, role);
  const column = Lib.returnedColumns(query, STAGE_INDEX).find(
    (column) => Lib.displayInfo(query, STAGE_INDEX, column).name === columnName,
  );
  if (column === undefined) {
    throw new Error(`No ${role} column in table ${table.id}`);
  }
  return column;
}

function getDateRangeFilter(
  column: Lib.ColumnMetadata,
  dateRange: string,
): Lib.ExpressionClause {
  const value = parseDateRange(dateRange);
  if (value === undefined) {
    throw new Error(`Invalid date range ${dateRange}`);
  }
  return getDateFilterClause(column, value);
}

/**
 * What the planner builds the analysis's query from. Throws when the table
 * isn't in the metadata provider, lacks a column for a required role, or the
 * date range isn't one the date picker can produce.
 */
export function getAnalysisState<K extends ProductAnalyticsKind>({
  kind,
  settings,
  table,
  metadataProvider,
}: AnalysisStateOptions<K>): Lib.AnalysisState {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
  if (tableMetadata === null) {
    throw new Error(`No metadata for table ${table.id}`);
  }
  const tableQuery = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );
  const timestampColumn = getRoleColumn(tableQuery, table, "timestamp");
  const personColumn = getRoleColumn(tableQuery, table, "person");
  const baseQuery = Lib.filter(
    tableQuery,
    STAGE_INDEX,
    getDateRangeFilter(timestampColumn, settings.date_range),
  );
  return {
    kind,
    base_query: baseQuery,
    "columns.person": Lib.columnUniqueKey(personColumn),
    "columns.timestamp": Lib.columnUniqueKey(timestampColumn),
    granularity: settings.granularity,
    "habit.values": "count",
  };
}
