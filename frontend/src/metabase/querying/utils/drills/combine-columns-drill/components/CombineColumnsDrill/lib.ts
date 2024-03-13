import * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "./types";

// hack due to Mantine Select being non-generic
export const fromSelectValue = (value: string | null): Lib.ColumnMetadata => {
  return value as unknown as Lib.ColumnMetadata;
};

// hack due to Mantine Select being non-generic
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
