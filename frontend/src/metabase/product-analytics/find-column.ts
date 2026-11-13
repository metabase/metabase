import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { FieldReference } from "metabase-types/api";

const STAGE = -1;

/** A column of the source table, or an expression. */
export const findColumn = (
  query: Lib.Query,
  name: string,
): Lib.ColumnMetadata => {
  const columns = Lib.visibleColumns(query, STAGE);
  const found = columns.find((column) => {
    const info = Lib.displayInfo(query, STAGE, column);
    return info.name === name && !info.isFromJoin;
  });
  if (!found) {
    throw new Error(`Column ${name} not found`);
  }
  return found;
};

/** The column a field ref points to, one through a foreign key included. */
export const findColumnByRef = (
  query: Lib.Query,
  fieldRef: FieldReference,
): Lib.ColumnMetadata => {
  const columns = Lib.visibleColumns(query, STAGE);
  const [index] = Lib.findColumnIndexesFromLegacyRefs(query, STAGE, columns, [
    fieldRef,
  ]);
  const column = index !== undefined ? columns[index] : undefined;
  if (column === undefined) {
    throw new Error(t`A column this analysis uses is no longer on the table.`);
  }
  return column;
};
