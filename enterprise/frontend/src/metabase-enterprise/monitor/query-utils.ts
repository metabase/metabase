import type { DateFilterValue } from "metabase/querying/common/types";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";

export function findColumn(
  query: Lib.Query,
  name: string,
  columnsFn: (q: Lib.Query, stageIndex: number) => Lib.ColumnMetadata[],
): Lib.ColumnMetadata | undefined {
  const columns = columnsFn(query, 0);
  const lowerName = name.toLowerCase();
  return columns.find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name?.toLowerCase() === lowerName;
  });
}

export function applyDateFilter(
  query: Lib.Query,
  dateFilter: DateFilterValue,
  columnName = "created_at",
): Lib.Query {
  const dateCol = findColumn(query, columnName, Lib.filterableColumns);
  if (!dateCol) {
    return query;
  }

  const clause = getDateFilterClause(dateCol, dateFilter);
  return Lib.filter(query, 0, clause);
}

export function applyIdFilter(
  query: Lib.Query,
  columnName: string,
  id: number | undefined,
): Lib.Query {
  if (id === undefined) {
    return query;
  }
  const column = findColumn(query, columnName, Lib.filterableColumns);
  if (!column) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({ operator: "=", column, values: [id] }),
  );
}

export function breakoutByColumn(
  query: Lib.Query,
  columnName: string,
): Lib.Query {
  const col = findColumn(query, columnName, Lib.breakoutableColumns);
  return col ? Lib.breakout(query, 0, col) : query;
}

function findJoinableColumn(
  columns: Lib.ColumnMetadata[],
  query: Lib.Query,
  name: string,
): Lib.ColumnMetadata | undefined {
  const lower = name.toLowerCase();
  return columns.find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name?.toLowerCase() === lower;
  });
}

export function joinGroupMembers(
  query: Lib.Query,
  groupMembersTable: Lib.TableMetadata | Lib.CardMetadata,
  sourceUserIdColumn = "user_id",
): Lib.Query {
  const lhsColumns = Lib.joinConditionLHSColumns(query, 0, groupMembersTable);
  const lhsUserId = findJoinableColumn(lhsColumns, query, sourceUserIdColumn);
  const rhsColumns = Lib.joinConditionRHSColumns(query, 0, groupMembersTable);
  const rhsUserId = findJoinableColumn(rhsColumns, query, "user_id");
  if (!lhsUserId || !rhsUserId) {
    return query;
  }

  const innerJoin = Lib.availableJoinStrategies(query, 0).find((strategy) => {
    const info = Lib.displayInfo(query, 0, strategy);
    return info.shortName === "inner-join";
  });
  if (!innerJoin) {
    return query;
  }

  return Lib.join(
    query,
    0,
    Lib.joinClause(
      groupMembersTable,
      [Lib.joinConditionClause("=", lhsUserId, rhsUserId)],
      innerJoin,
    ),
  );
}
