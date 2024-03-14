import { t } from "ttag";

import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import type { ColumnAndSeparator, ColumnOption } from "./types";

export const getColumnOptions = (
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) => {
  return columns.map((column, index) => {
    const info = Lib.displayInfo(query, stageIndex, column);

    return {
      column,
      label: info.displayName,
      value: String(index),
    };
  });
};

export const fromSelectValue = (
  options: ColumnOption[],
  value: string | null,
): Lib.ColumnMetadata => {
  const index = Number(checkNotNull(value));
  const { column } = options[index];
  return column;
};

export const toSelectValue = (
  options: ColumnOption[],
  column: Lib.ColumnMetadata,
): string => {
  const index = options.findIndex(option => option.column === column);
  return String(index);
};

export const getInitialColumnAndSeparator = (
  drillInfo: Lib.CombineColumnsDrillThruInfo,
): ColumnAndSeparator => ({
  column: drillInfo.availableColumns[0],
  separator: drillInfo.defaultSeparator,
});

export const getNextColumnAndSeparator = (
  drillInfo: Lib.CombineColumnsDrillThruInfo,
  options: ColumnOption[],
  columnsAndSeparators: ColumnAndSeparator[],
): ColumnAndSeparator => {
  const lastSeparator = columnsAndSeparators.at(-1)?.separator;
  const separator = lastSeparator ?? drillInfo.defaultSeparator;
  const nextUnusedOption = options.find(option => {
    return columnsAndSeparators.every(({ column }) => column !== option.column);
  });

  if (nextUnusedOption) {
    return {
      column: nextUnusedOption.column,
      separator,
    };
  }

  return {
    column: drillInfo.availableColumns[0],
    separator,
  };
};

export const formatSeparator = (separator: string) => {
  if (separator === " ") {
    return `(${t`space`})`;
  }
  return separator;
};
