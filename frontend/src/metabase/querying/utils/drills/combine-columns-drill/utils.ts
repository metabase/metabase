import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type { Dataset, RowValue, RowValues } from "metabase-types/api";

import type { ColumnAndSeparator, ColumnOption } from "./types";

export const getColumnOptions = (
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) => {
  return columns.map((column, index) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    const label = info.displayName;
    const value = String(index);
    return { column, label, value };
  });
};

export const fromSelectValue = (
  options: ColumnOption[],
  value: string | null,
): Lib.ColumnMetadata => {
  const index = Number(checkNotNull(value));
  return options[index].column;
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
  const defaultColumn = drillInfo.availableColumns[0];
  const nextUnusedOption = options.find(option => {
    return columnsAndSeparators.every(({ column }) => column !== option.column);
  });
  const column = nextUnusedOption ? nextUnusedOption.column : defaultColumn;
  return { column, separator };
};

export const extractQueryResults = (
  datasets: Dataset[] | null,
): RowValues[] => {
  if (!datasets || datasets.length === 0) {
    return [];
  }

  return datasets[0].data.rows;
};

export const getPreview = (
  query: Lib.Query,
  stageIndex: number,
  drill: Lib.DrillThru,
  columnsAndSeparators: ColumnAndSeparator[],
  queryResults: RowValues[],
): RowValue[] => {
  const expression = Lib.combineColumnsDrillExpression(
    query,
    stageIndex,
    drill,
    columnsAndSeparators,
  );
  const preview = Lib.previewExpression(
    query,
    stageIndex,
    expression,
    queryResults,
  );
  return preview;
};
