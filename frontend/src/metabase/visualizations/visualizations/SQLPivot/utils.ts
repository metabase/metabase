import { t } from "ttag";
import _ from "underscore";

import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

export interface SQLPivotSettings {
  "sqlpivot.row_column"?: string;
  "sqlpivot.value_columns"?: string | string[];
  "sqlpivot.transpose"?: boolean;
}

export function isSQLPivotSensible(data: DatasetData): boolean {
  // Need at least 2 columns: 1 dimension + 1+ values
  if (data.cols.length < 2) {
    return false;
  }

  // Should have at least one string column (for grouping) and one numeric column (for values)
  const stringColumns = data.cols.filter(isString);
  const numericColumns = data.cols.filter(isNumber);

  return stringColumns.length >= 1 && numericColumns.length >= 1;
}

export function getDefaultRowColumn(columns: DatasetColumn[]): string | null {
  // Prefer the first string column as row dimension
  const stringColumn = columns.find(isString);
  return stringColumn?.name || null;
}

export function getDefaultValueColumns(columns: DatasetColumn[]): string[] {
  // Use all numeric columns as values by default
  return columns.filter(isNumber).map(col => col.name);
}

export function transformSQLDataToPivot(
  data: DatasetData,
  settings: SQLPivotSettings,
) {
  const rowColumnName = settings["sqlpivot.row_column"];
  const rawValueColumns = settings["sqlpivot.value_columns"];
  const transpose = settings["sqlpivot.transpose"] || false;

  // Handle both string and array cases for value columns
  let valueColumnNames: string[] = [];
  if (typeof rawValueColumns === "string") {
    valueColumnNames = [rawValueColumns];
  } else if (Array.isArray(rawValueColumns)) {
    valueColumnNames = rawValueColumns;
  }

  if (!rowColumnName || valueColumnNames.length === 0) {
    return data; // Return original data if not configured
  }

  const rowColumnIndex = data.cols.findIndex(col => col.name === rowColumnName);
  const valueColumnIndexes = valueColumnNames.map(name => 
    data.cols.findIndex(col => col.name === name)
  ).filter(index => index !== -1);

  if (rowColumnIndex === -1 || valueColumnIndexes.length === 0) {
    return data; // Return original data if columns not found
  }

  if (transpose) {
    return transformToTransposedPivot(data, rowColumnIndex, valueColumnIndexes);
  } else {
    return transformToStandardPivot(data, rowColumnIndex, valueColumnIndexes);
  }
}

function transformToStandardPivot(
  data: DatasetData,
  rowColumnIndex: number,
  valueColumnIndexes: number[],
) {
  // Standard pivot: Row dimension values become rows, value columns become columns
  // Example: COUNTRY -> rows, SUM(RATING), COUNT(*) -> columns
  
  const rowColumn = data.cols[rowColumnIndex];
  const valueColumns = valueColumnIndexes.map(index => data.cols[index]);

  // Get unique row values
  const uniqueRowValues = _.uniq(data.rows.map(row => row[rowColumnIndex]));

  // Create new column structure: [Row Dimension, Value1, Value2, ...]
  const newCols = [
    rowColumn,
    ...valueColumns
  ];

  // Create pivot rows
  const pivotRows = uniqueRowValues.map(rowValue => {
    // Find the original row that matches this row value
    const originalRow = data.rows.find(row => row[rowColumnIndex] === rowValue);
    
    if (!originalRow) {
      return [rowValue, ...valueColumnIndexes.map(() => null)];
    }

    return [
      rowValue,
      ...valueColumnIndexes.map(index => originalRow[index])
    ];
  });

  return {
    cols: newCols,
    rows: pivotRows,
    results_timezone: data.results_timezone,
  };
}

function transformToTransposedPivot(
  data: DatasetData,
  rowColumnIndex: number,
  valueColumnIndexes: number[],
) {
  // Transposed pivot: Value column names become rows, row dimension values become columns
  // Example: Metrics -> rows, Countries -> columns
  
  const rowColumn = data.cols[rowColumnIndex];
  const valueColumns = valueColumnIndexes.map(index => data.cols[index]);

  // Get unique row values to become column headers
  const uniqueRowValues = _.uniq(data.rows.map(row => row[rowColumnIndex]));

  // Create new column structure: [Metric, Country1, Country2, ...]
  const newCols = [
    {
      ...rowColumn,
      name: "metric",
      display_name: t`Metric`,
    },
    ...uniqueRowValues.map(value => ({
      ...rowColumn,
      name: `${rowColumn.name}_${value}`,
      display_name: String(value),
    }))
  ];

  // Create pivot rows - one row per value column
  const pivotRows = valueColumns.map(valueColumn => {
    const valueColumnIndex = valueColumnIndexes.find(index => 
      data.cols[index].name === valueColumn.name
    );
    
    if (valueColumnIndex === undefined) {
      return [valueColumn.display_name, ...uniqueRowValues.map(() => null)];
    }

    return [
      valueColumn.display_name,
      ...uniqueRowValues.map(rowValue => {
        const originalRow = data.rows.find(row => row[rowColumnIndex] === rowValue);
        return originalRow ? originalRow[valueColumnIndex] : null;
      })
    ];
  });

  return {
    cols: newCols,
    rows: pivotRows,
    results_timezone: data.results_timezone,
  };
}

export function checkSQLPivotRenderable(
  data: DatasetData,
  settings: SQLPivotSettings,
) {
  if (!isSQLPivotSensible(data)) {
    throw new Error(
      t`SQL Pivot requires at least one text column and one numeric column.`
    );
  }

  const rowColumnName = settings["sqlpivot.row_column"];
  const rawValueColumns = settings["sqlpivot.value_columns"];

  // Handle both string and array cases for value columns
  let valueColumnNames: string[] = [];
  if (typeof rawValueColumns === "string") {
    valueColumnNames = [rawValueColumns];
  } else if (Array.isArray(rawValueColumns)) {
    valueColumnNames = rawValueColumns;
  }

  if (!rowColumnName) {
    throw new Error(t`Please select a row column for the pivot table.`);
  }

  if (valueColumnNames.length === 0) {
    throw new Error(t`Please select at least one value column for the pivot table.`);
  }
} 