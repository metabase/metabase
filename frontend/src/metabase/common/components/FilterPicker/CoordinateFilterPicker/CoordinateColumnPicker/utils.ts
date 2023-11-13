import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { ColumnOption } from "./types";

export function getColumnOptions(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
): ColumnOption[] {
  return columns.map((column, columnIndex) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return {
      column,
      value: String(columnIndex),
      label: columnInfo.displayName,
    };
  });
}

export function getColumnPlaceholder(column: Lib.ColumnMetadata) {
  return Lib.isLatitude(column)
    ? t`Select longitude column`
    : t`Select latitude column`;
}
