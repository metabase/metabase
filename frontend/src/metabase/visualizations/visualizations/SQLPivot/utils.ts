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
  "sqlpivot.column_dimension"?: string;
  "sqlpivot.value_columns"?: string | string[];
  "sqlpivot.transpose"?: boolean;
  "sqlpivot.show_row_aggregation"?: boolean;
  "sqlpivot.show_column_aggregation"?: boolean;
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

export function getDefaultColumnDimension(columns: DatasetColumn[]): string | null {
  // Prefer the second string column as column dimension, fallback to first if only one exists
  const stringColumns = columns.filter(isString);
  if (stringColumns.length > 1) {
    return stringColumns[1].name;
  }
  return null; // Don't auto-select if only one string column (used for rows)
}

export function transformSQLDataToPivot(
  data: DatasetData,
  settings: SQLPivotSettings,
) {
  const rowColumnName = settings["sqlpivot.row_column"];
  const columnDimensionName = settings["sqlpivot.column_dimension"];
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
  const columnDimensionIndex = columnDimensionName ? 
    data.cols.findIndex(col => col.name === columnDimensionName) : -1;
  const valueColumnIndexes = valueColumnNames.map(name => 
    data.cols.findIndex(col => col.name === name)
  ).filter(index => index !== -1);

  if (rowColumnIndex === -1 || valueColumnIndexes.length === 0) {
    return data; // Return original data if columns not found
  }

  // If column dimension is selected, create matrix pivot
  if (columnDimensionIndex !== -1) {
    const showRowAggregation = settings["sqlpivot.show_row_aggregation"] || false;
    const showColumnAggregation = settings["sqlpivot.show_column_aggregation"] || false;
    return transformToMatrixPivot(
      data, 
      rowColumnIndex, 
      columnDimensionIndex, 
      valueColumnIndexes,
      showRowAggregation,
      showColumnAggregation
    );
  }

  // Otherwise use the original pivot logic
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

function transformToMatrixPivot(
  data: DatasetData,
  rowColumnIndex: number,
  columnDimensionIndex: number,
  valueColumnIndexes: number[],
  showRowAggregation: boolean = false,
  showColumnAggregation: boolean = false,
) {
  // Matrix pivot: Create traditional pivot table with rows and columns from dimensions
  // Row dimension values become rows, column dimension values become columns
  
  const rowColumn = data.cols[rowColumnIndex];
  const columnDimensionColumn = data.cols[columnDimensionIndex];
  const valueColumn = data.cols[valueColumnIndexes[0]]; // Use first value column for matrix

  console.log("Matrix pivot transform:", {
    rowColumn: rowColumn.name,
    columnDimension: columnDimensionColumn.name,
    valueColumn: valueColumn.name
  });

  // Get unique values for rows and columns
  const uniqueRowValues = _.uniq(data.rows.map(row => row[rowColumnIndex])).sort();
  const uniqueColumnValues = _.uniq(data.rows.map(row => row[columnDimensionIndex])).sort();

  console.log("Matrix dimensions:", {
    rowValues: uniqueRowValues,
    columnValues: uniqueColumnValues
  });

  // Create new column structure: [Row Dimension, Col1, Col2, Col3, ...]
  const newCols = [
    rowColumn,
    ...uniqueColumnValues.map(value => ({
      ...valueColumn,
      name: `${columnDimensionColumn.name}_${value}`,
      display_name: String(value),
      _dimension: {
        value: value,
        column: columnDimensionColumn,
      },
    }))
  ];

  // Add row aggregation column if requested
  if (showRowAggregation) {
    newCols.push({
      ...valueColumn,
      name: "row_aggregation",
      display_name: "Row Avg",
    });
  }

  // Create matrix rows
  const matrixRows = uniqueRowValues.map(rowValue => {
    const row = [rowValue]; // Start with row dimension value
    const rowValues: number[] = []; // Collect values for row aggregation
    
    // Fill in values for each column dimension
    uniqueColumnValues.forEach(columnValue => {
      // Find the data row that matches both row and column values
      const dataRow = data.rows.find(r => 
        r[rowColumnIndex] === rowValue && 
        r[columnDimensionIndex] === columnValue
      );
      
      // Add the value or null if no match found
      const cellValue = dataRow ? dataRow[valueColumnIndexes[0]] : null;
      row.push(cellValue);
      
      // Collect non-null values for aggregation
      if (cellValue !== null && cellValue !== undefined && !isNaN(Number(cellValue))) {
        rowValues.push(Number(cellValue));
      }
    });

    // Add row aggregation if requested
    if (showRowAggregation) {
      const rowAverage = rowValues.length > 0 
        ? rowValues.reduce((sum, val) => sum + val, 0) / rowValues.length 
        : null;
      row.push(rowAverage);
    }

    // Add dimension info for click handling
    (row as any)._dimension = {
      value: rowValue,
      column: rowColumn,
    };

    return row;
  });

  // Add column aggregation row if requested
  if (showColumnAggregation) {
    const columnAggregationRow: any[] = ["Column Avg"]; // Start with label
    
    // Calculate averages for each column
    uniqueColumnValues.forEach((_, columnIndex) => {
      const columnValues: number[] = [];
      
      matrixRows.forEach(row => {
        const cellValue = row[columnIndex + 1]; // +1 to skip row dimension column
        if (cellValue !== null && cellValue !== undefined && !isNaN(Number(cellValue))) {
          columnValues.push(Number(cellValue));
        }
      });
      
      const columnAverage = columnValues.length > 0 
        ? columnValues.reduce((sum, val) => sum + val, 0) / columnValues.length 
        : null;
      columnAggregationRow.push(columnAverage);
    });

    // Add overall average if row aggregation is also shown
    if (showRowAggregation) {
      const allValues: number[] = [];
      matrixRows.forEach(row => {
        for (let i = 1; i < row.length - (showRowAggregation ? 1 : 0); i++) {
          const cellValue = row[i];
          if (cellValue !== null && cellValue !== undefined && !isNaN(Number(cellValue))) {
            allValues.push(Number(cellValue));
          }
        }
      });
      
      const overallAverage = allValues.length > 0 
        ? allValues.reduce((sum, val) => sum + val, 0) / allValues.length 
        : null;
      columnAggregationRow.push(overallAverage);
    }

    matrixRows.push(columnAggregationRow as any);
  }

  console.log("Matrix result:", {
    colCount: newCols.length,
    rowCount: matrixRows.length,
    sampleRow: matrixRows[0],
    showRowAggregation,
    showColumnAggregation
  });

  return {
    cols: newCols,
    rows: matrixRows,
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
  const columnDimensionName = settings["sqlpivot.column_dimension"];
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

  // Validate column dimension if provided
  if (columnDimensionName && columnDimensionName === rowColumnName) {
    throw new Error(t`Row dimension and column dimension cannot be the same column.`);
  }
} 