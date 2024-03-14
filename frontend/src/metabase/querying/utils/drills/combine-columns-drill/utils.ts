import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { ColumnAndSeparator, ColumnOption } from "./types";

export const formatSeparator = (separator: string) => {
  if (separator === " ") {
    return `(${t`space`})`;
  }
  return separator;
};

// reusable casting hack due to Mantine Select being non-generic
export const fromSelectValue = (value: string | null): Lib.ColumnMetadata => {
  return value as unknown as Lib.ColumnMetadata;
};

// reusable casting hack due to Mantine Select being non-generic
export const toSelectValue = (value: Lib.ColumnMetadata): string => {
  return value as unknown as string;
};

export const getColumnOptions = (
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) => {
  return columns.map(column => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return { label: info.displayName, value: toSelectValue(column) };
  });
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
  const [nextUnusedOption] = options.filter(option => {
    return columnsAndSeparators.every(
      ({ column }) => column !== fromSelectValue(option.value),
    );
  });

  if (nextUnusedOption) {
    return {
      column: fromSelectValue(nextUnusedOption.value),
      separator,
    };
  }

  return {
    column: drillInfo.availableColumns[0],
    separator,
  };
};
