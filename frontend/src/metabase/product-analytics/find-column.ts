import * as Lib from "metabase-lib";

const STAGE = -1;

const findVisibleColumn = (
  query: Lib.Query,
  name: string,
  isFromJoin: boolean,
): Lib.ColumnMetadata => {
  const columns = Lib.visibleColumns(query, STAGE);
  const found = columns.find((column) => {
    const info = Lib.displayInfo(query, STAGE, column);
    return info.name === name && info.isFromJoin === isFromJoin;
  });
  if (!found) {
    throw new Error(`Column ${name} not found`);
  }
  return found;
};

/** A column of the source table, or an expression. */
export const findColumn = (
  query: Lib.Query,
  name: string,
): Lib.ColumnMetadata => findVisibleColumn(query, name, false);

/** A column of an explicitly joined table. */
export const findJoinedColumn = (
  query: Lib.Query,
  name: string,
): Lib.ColumnMetadata => findVisibleColumn(query, name, true);
