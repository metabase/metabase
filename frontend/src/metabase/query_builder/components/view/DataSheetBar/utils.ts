import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getDataLabel } from "../SummaryCanvas/utils";

const DEFAULT_COLUMN_NAME_MAX_LENGTH = 40;

/** A readable default name for a formula: `[Price] / 2` becomes "Price / 2". */
export function getDefaultColumnName(source: string): string {
  const name = source
    .replace(/\[([^\]]*)\]?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > DEFAULT_COLUMN_NAME_MAX_LENGTH
    ? `${name.slice(0, DEFAULT_COLUMN_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : name;
}

/** "Sample Database / Orders": the database and the table (or saved question) the data tab shows. */
export function getDataPath(question: Question): string {
  const databaseName = question.database()?.displayName();
  const dataLabel = getDataLabel(question);
  return databaseName ? `${databaseName} / ${dataLabel}` : dataLabel;
}

/**
 * The column a search filters on: an entity name ("Name", "Title") of the table itself, then one
 * from a linked table, then any text column of the table itself, then any text column.
 */
export function getSearchColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata | null {
  const columns = Lib.filterableColumns(query, stageIndex);
  const ownColumns = columns.filter((column) => {
    const { isFromJoin, isImplicitlyJoinable } = Lib.displayInfo(
      query,
      stageIndex,
      column,
    );
    return !isFromJoin && !isImplicitlyJoinable;
  });

  const isNameColumn = (column: Lib.ColumnMetadata) =>
    Lib.isEntityName(column) || Lib.isTitle(column);

  return (
    ownColumns.find(isNameColumn) ??
    columns.find(isNameColumn) ??
    ownColumns.find(Lib.isStringOrStringLike) ??
    columns.find(Lib.isStringOrStringLike) ??
    null
  );
}

export type AppliedSearchFilter = {
  searchText: string;
  clause: Lib.FilterClause;
};

/**
 * Replaces the previously applied search filter, if any, with a case-insensitive
 * "contains" filter on the search column. An empty search only removes it.
 */
export function applySearchFilter(
  query: Lib.Query,
  stageIndex: number,
  previousFilter: AppliedSearchFilter | null,
  searchText: string,
): { query: Lib.Query; filter: AppliedSearchFilter | null } {
  const queryWithoutSearch = previousFilter
    ? Lib.removeClause(query, stageIndex, previousFilter.clause)
    : query;
  const column = getSearchColumn(queryWithoutSearch, stageIndex);
  if (searchText.length === 0 || column == null) {
    return { query: queryWithoutSearch, filter: null };
  }

  const nextQuery = Lib.filter(
    queryWithoutSearch,
    stageIndex,
    Lib.stringFilterClause({
      operator: "contains",
      column,
      values: [searchText],
      options: { caseSensitive: false },
    }),
  );
  const clause = Lib.filters(nextQuery, stageIndex).at(-1);
  return {
    query: nextQuery,
    filter: clause ? { searchText, clause } : null,
  };
}

/** `name`, or `name (2)`, `name (3)`… when a column with that name already exists. */
export function getUniqueColumnName(
  query: Lib.Query,
  stageIndex: number,
  name: string,
): string {
  const takenNames = new Set(
    Lib.returnedColumns(query, stageIndex).map(
      (column) => Lib.displayInfo(query, stageIndex, column).displayName,
    ),
  );
  let uniqueName = name;
  for (let suffix = 2; takenNames.has(uniqueName); suffix++) {
    uniqueName = `${name} (${suffix})`;
  }
  return uniqueName;
}
