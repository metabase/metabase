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
      label: columnInfo.longDisplayName,
    };
  });
}

export function getInitialOption(
  query: Lib.Query,
  stageIndex: number,
  options: ColumnOption[],
  secondColumn?: Lib.ColumnMetadata,
) {
  if (!secondColumn) {
    return undefined;
  }

  const columnInfo = Lib.displayInfo(query, stageIndex, secondColumn);
  return options.find(option => option.label === columnInfo?.longDisplayName);
}

export function getColumnPlaceholder(column: Lib.ColumnMetadata) {
  return Lib.isLatitude(column)
    ? t`Select longitude column`
    : t`Select latitude column`;
}
