import { t } from "ttag";
import _ from "underscore";

import { isNumber, isString } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

export interface SQLPivotSettings {
  "sqlpivot.row_columns"?: string | string[];
  "sqlpivot.column_dimension"?: string;
  "sqlpivot.value_columns"?: string | string[];
  "sqlpivot.transpose"?: boolean;
  "sqlpivot.show_row_aggregation"?: boolean;
  "sqlpivot.show_column_aggregation"?: boolean;
  "sqlpivot.hidden_column_labels"?: string[];
  "sqlpivot.enable_color_coding"?: boolean;
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

export function getDefaultRowColumns(columns: DatasetColumn[]): string[] {
  // Prefer the first string column as primary row dimension
  const stringColumn = columns.find(isString);
  return stringColumn ? [stringColumn.name] : [];
}

export function getDefaultValueColumns(columns: DatasetColumn[]): string[] {
  // Use all numeric columns as values by default
  return columns.filter(isNumber).map((col) => col.name);
}

export function getDefaultColumnDimension(
  columns: DatasetColumn[],
): string | null {
  // Prefer the second string column as column dimension, fallback to first if only one exists
  const stringColumns = columns.filter(isString);
  if (stringColumns.length > 1) {
    return stringColumns[1].name;
  }
  return null; // Don't auto-select if only one string column (used for rows)
}

export function getAllVisibleColumns(
  data: DatasetData,
  settings: SQLPivotSettings,
): DatasetColumn[] {
  // This function returns all columns that would be visible in the transformed pivot data
  const transformedData = transformSQLDataToPivot(data, settings);
  return transformedData.cols;
}

function calculateRowAggregation(
  data: DatasetData,
  matchingRows: any[],
  fallbackValues: number[],
): number | null {
  const totalWeightedScoreIndex = data.cols.findIndex(
    (col) => col.name === "total_weighted_score",
  );

  if (totalWeightedScoreIndex !== -1) {
    const totalResponsesIndex = data.cols.findIndex(
      (col) => col.name === "total_responses",
    );

    // Sum up total_weighted_score values
    const totalWeightedScore = matchingRows.reduce((sum, row) => {
      const score = row[totalWeightedScoreIndex];
      return (
        sum +
        (score !== null && score !== undefined && !isNaN(Number(score))
          ? Number(score)
          : 0)
      );
    }, 0);

    // Sum up the actual response counts from the total_responses column
    const totalResponses =
      totalResponsesIndex !== -1
        ? matchingRows.reduce((sum, row) => {
            const responseCount = row[totalResponsesIndex];
            return (
              sum +
              (responseCount !== null &&
              responseCount !== undefined &&
              !isNaN(Number(responseCount))
                ? Number(responseCount)
                : 0)
            );
          }, 0)
        : matchingRows.length; // fallback to row count if column not found

    return totalResponses > 0 ? totalWeightedScore / totalResponses : null;
  } else {
    // Fallback to original calculation if total_weighted_score column not found
    return fallbackValues.length > 0
      ? fallbackValues.reduce((sum, val) => sum + val, 0) /
          fallbackValues.length
      : null;
  }
}

// Helper function to validate and clean transformed data
function validateTransformedData(transformedData: any): any {
  if (
    !transformedData ||
    !Array.isArray(transformedData.rows) ||
    !Array.isArray(transformedData.cols)
  ) {
    console.warn(
      "SQLPivot: Invalid transformed data structure, returning empty data",
    );
    return {
      cols: [],
      rows: [],
      results_timezone: transformedData?.results_timezone || undefined,
    };
  }

  // Filter out any invalid rows
  const validRows = transformedData.rows.filter((row: any) => {
    if (!Array.isArray(row)) {
      console.warn("SQLPivot: Filtering out invalid row (not an array):", row);
      return false;
    }
    return true;
  });

  return {
    ...transformedData,
    rows: validRows,
  };
}

export function transformSQLDataToPivot(
  data: DatasetData,
  settings: SQLPivotSettings,
) {
  // Validate input data structure
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.cols)) {
    console.warn("SQLPivot: Invalid input data structure:", data);
    return (
      data || {
        cols: [],
        rows: [],
        results_timezone: undefined,
        results_metadata: { checksum: null, columns: [] },
        rows_truncated: 0,
        native_form: { query: null },
      }
    );
  }

  const rawRowColumns = settings["sqlpivot.row_columns"];
  const columnDimensionName = settings["sqlpivot.column_dimension"];
  const rawValueColumns = settings["sqlpivot.value_columns"];
  const transpose = settings["sqlpivot.transpose"] || false;

  // Handle both string and array cases for row columns
  let rowColumnNames: string[] = [];
  if (typeof rawRowColumns === "string") {
    rowColumnNames = [rawRowColumns];
  } else if (Array.isArray(rawRowColumns)) {
    rowColumnNames = rawRowColumns;
  }

  // Handle both string and array cases for value columns
  let valueColumnNames: string[] = [];
  if (typeof rawValueColumns === "string") {
    valueColumnNames = [rawValueColumns];
  } else if (Array.isArray(rawValueColumns)) {
    valueColumnNames = rawValueColumns;
  }

  if (rowColumnNames.length === 0 || valueColumnNames.length === 0) {
    return data; // Return original data if not configured
  }

  const rowColumnIndexes = rowColumnNames
    .map((name) => data.cols.findIndex((col) => col.name === name))
    .filter((index) => index !== -1);
  const columnDimensionIndex = columnDimensionName
    ? data.cols.findIndex((col) => col.name === columnDimensionName)
    : -1;
  const valueColumnIndexes = valueColumnNames
    .map((name) => data.cols.findIndex((col) => col.name === name))
    .filter((index) => index !== -1);

  if (rowColumnIndexes.length === 0 || valueColumnIndexes.length === 0) {
    return data; // Return original data if columns not found
  }

  // If column dimension is selected, create matrix pivot
  if (columnDimensionIndex !== -1) {
    const showRowAggregation =
      settings["sqlpivot.show_row_aggregation"] || false;
    const showColumnAggregation =
      settings["sqlpivot.show_column_aggregation"] || false;
    const result = transformToMatrixPivot(
      data,
      rowColumnIndexes,
      columnDimensionIndex,
      valueColumnIndexes,
      showRowAggregation,
      showColumnAggregation,
    );
    return validateTransformedData(result);
  }

  // Otherwise use the original pivot logic
  if (transpose) {
    const result = transformToTransposedPivot(
      data,
      rowColumnIndexes,
      valueColumnIndexes,
    );
    return validateTransformedData(result);
  } else {
    const result = transformToStandardPivot(
      data,
      rowColumnIndexes,
      valueColumnIndexes,
    );
    return validateTransformedData(result);
  }
}

function transformToStandardPivot(
  data: DatasetData,
  rowColumnIndexes: number[],
  valueColumnIndexes: number[],
) {
  // Standard pivot: Create hierarchical row structure
  // Example: DEPARTMENT as main rows, with QUARTER as sub-rows

  const valueColumns = valueColumnIndexes.map((index) => data.cols[index]);

  if (rowColumnIndexes.length === 1) {
    // Single row dimension - use simple pivot
    const rowColumn = data.cols[rowColumnIndexes[0]];
    const uniqueRowValues = _.uniq(
      data.rows.map((row) => row[rowColumnIndexes[0]]),
    );

    const newCols = [rowColumn, ...valueColumns];
    const pivotRows = uniqueRowValues.map((rowValue) => {
      const originalRow = data.rows.find(
        (row) => row[rowColumnIndexes[0]] === rowValue,
      );
      if (!originalRow) {
        return [rowValue, ...valueColumnIndexes.map(() => null)];
      }
      return [
        rowValue,
        ...valueColumnIndexes.map((index) => originalRow[index]),
      ];
    });

    return {
      cols: newCols,
      rows: pivotRows,
      results_timezone: data.results_timezone,
    };
  }

  // Multiple row dimensions - create hierarchical structure
  const primaryRowColumn = data.cols[rowColumnIndexes[0]];

  // Create new column structure: [Primary Row Dimension, Value1, Value2, ...]
  const newCols = [
    {
      ...primaryRowColumn,
      name: "row_hierarchy",
      display_name: "Category",
    },
    ...valueColumns,
  ];

  // Group data by primary dimension
  const primaryValues = _.uniq(
    data.rows.map((row) => row[rowColumnIndexes[0]]),
  );
  const hierarchicalRows: any[] = [];

  primaryValues.forEach((primaryValue) => {
    // Add the main category row
    hierarchicalRows.push([
      primaryValue,
      ...valueColumnIndexes.map(() => null), // No values for header rows
    ]);

    // Get all combinations for this primary value
    const subRows = data.rows.filter(
      (row) => row[rowColumnIndexes[0]] === primaryValue,
    );

    // Create a key for sub-dimensions (excluding the primary dimension)
    const subDimensionIndexes = rowColumnIndexes.slice(1);
    const createSubKey = (row: any[]) =>
      subDimensionIndexes.map((index) => row[index]).join("|");

    const uniqueSubKeys = _.uniq(subRows.map(createSubKey));

    uniqueSubKeys.forEach((subKey) => {
      const subValues = subKey.split("|");
      const subLabel =
        subValues.length > 1 ? subValues.join(" - ") : subValues[0];

      // Find the data row for this sub-combination
      const matchingRow = subRows.find((row) =>
        subDimensionIndexes.every(
          (colIndex, i) => row[colIndex] === subValues[i],
        ),
      );

      // Add indented sub-row
      hierarchicalRows.push([
        `\u00A0\u00A0\u00A0\u00A0${subLabel}`, // Use non-breaking spaces for proper indentation
        ...valueColumnIndexes.map((index) =>
          matchingRow ? matchingRow[index] : null,
        ),
      ]);
    });
  });

  return {
    cols: newCols,
    rows: hierarchicalRows,
    results_timezone: data.results_timezone,
  };
}

function transformToTransposedPivot(
  data: DatasetData,
  rowColumnIndexes: number[],
  valueColumnIndexes: number[],
) {
  // Transposed pivot: Value column names become rows, row dimension combinations become columns
  // Example: Metrics -> rows, Country+Region combinations -> columns

  const valueColumns = valueColumnIndexes.map((index) => data.cols[index]);

  // Create a key function to identify unique row combinations
  const createRowKey = (row: any[]) =>
    rowColumnIndexes.map((index) => row[index]).join(" | ");

  // Get unique row value combinations to become column headers
  const uniqueRowKeys = _.uniq(data.rows.map(createRowKey));

  // Create new column structure: [Metric, Combination1, Combination2, ...]
  const newCols = [
    {
      ...valueColumns[0],
      name: "metric",
      display_name: t`Metric`,
    },
    ...uniqueRowKeys.map((key) => ({
      ...valueColumns[0],
      name: `row_combination_${key.replace(/[^a-zA-Z0-9]/g, "_")}`,
      display_name: key,
    })),
  ];

  // Create pivot rows - one row per value column
  const pivotRows = valueColumns.map((valueColumn) => {
    const valueColumnIndex = valueColumnIndexes.find(
      (index) => data.cols[index].name === valueColumn.name,
    );

    if (valueColumnIndex === undefined) {
      return [valueColumn.display_name, ...uniqueRowKeys.map(() => null)];
    }

    return [
      valueColumn.display_name,
      ...uniqueRowKeys.map((key) => {
        const keyValues = key.split(" | ");
        const originalRow = data.rows.find((row) =>
          rowColumnIndexes.every(
            (colIndex, i) => String(row[colIndex] ?? "") === keyValues[i],
          ),
        );
        return originalRow ? originalRow[valueColumnIndex] : null;
      }),
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
  rowColumnIndexes: number[],
  columnDimensionIndex: number,
  valueColumnIndexes: number[],
  showRowAggregation: boolean = false,
  _showColumnAggregation: boolean = false,
) {
  // Matrix pivot: Create hierarchical row structure with column values spread across columns

  const columnDimensionColumn = data.cols[columnDimensionIndex];
  const valueColumn = data.cols[valueColumnIndexes[0]]; // Use first value column for matrix
  const uniqueColumnValues = _.uniq(
    data.rows.map((row) => row[columnDimensionIndex]),
  ).sort();

  if (rowColumnIndexes.length === 1) {
    // Single row dimension - use simple matrix pivot
    const rowColumn = data.cols[rowColumnIndexes[0]];
    const uniqueRowValues = _.uniq(
      data.rows.map((row) => row[rowColumnIndexes[0]]),
    );

    // Create new column structure: [Row Dimension, Col1, Col2, Col3, ...]
    const newCols = [
      rowColumn,
      ...uniqueColumnValues.map((value) => ({
        ...valueColumn,
        name: `${columnDimensionColumn.name}_${value}`,
        display_name: String(value ?? ""),
        _dimension: {
          value: value,
          column: columnDimensionColumn,
        },
      })),
    ];

    // Add row aggregation column if requested
    if (showRowAggregation) {
      newCols.push({
        ...valueColumn,
        name: "row_aggregation",
        display_name: "Overall Score",
      });
    }

    // Create matrix rows
    const matrixRows = uniqueRowValues.map((rowValue) => {
      const row = [rowValue];
      const rowValues: number[] = [];

      // Fill in values for each column dimension
      uniqueColumnValues.forEach((columnValue) => {
        const dataRow = data.rows.find(
          (r) =>
            r[rowColumnIndexes[0]] === rowValue &&
            r[columnDimensionIndex] === columnValue,
        );

        const cellValue = dataRow ? dataRow[valueColumnIndexes[0]] : null;
        row.push(cellValue as any);

        if (
          cellValue !== null &&
          cellValue !== undefined &&
          !isNaN(Number(cellValue))
        ) {
          rowValues.push(Number(cellValue));
        }
      });

      // Add row aggregation if requested
      if (showRowAggregation) {
        const matchingRows = data.rows.filter(
          (r) => r[rowColumnIndexes[0]] === rowValue,
        );
        const rowAggregation = calculateRowAggregation(
          data,
          matchingRows,
          rowValues,
        );
        row.push(rowAggregation as any);
      }

      return row;
    });

    return {
      cols: newCols,
      rows: matrixRows,
      results_timezone: data.results_timezone,
    };
  }

  // Multiple row dimensions - create hierarchical structure with matrix columns
  const primaryRowColumn = data.cols[rowColumnIndexes[0]];

  // Create new column structure: [Primary Row Dimension, Col1, Col2, Col3, ...]
  const newCols = [
    {
      ...primaryRowColumn,
      name: "row_hierarchy",
      display_name: "Category",
    },
    ...uniqueColumnValues.map((value) => ({
      ...valueColumn,
      name: `${columnDimensionColumn.name}_${value}`,
      display_name: String(value ?? ""),
      _dimension: {
        value: value,
        column: columnDimensionColumn,
      },
    })),
  ];

  // Add row aggregation column if requested
  if (showRowAggregation) {
    newCols.push({
      ...valueColumn,
      name: "row_aggregation",
      display_name: "Row Avg",
    });
  }

  // Group data by primary dimension
  const primaryValues = _.uniq(
    data.rows.map((row) => row[rowColumnIndexes[0]]),
  );
  const hierarchicalRows: any[] = [];

  primaryValues.forEach((primaryValue) => {
    // Add the main category row with column values
    const mainRowValues: number[] = [];
    const mainRow = [primaryValue];

    // Calculate aggregated values for main category across all column dimensions
    uniqueColumnValues.forEach((columnValue) => {
      const allMatchingRows = data.rows.filter(
        (row) =>
          row[rowColumnIndexes[0]] === primaryValue &&
          row[columnDimensionIndex] === columnValue,
      );

      if (allMatchingRows.length > 0) {
        const values = allMatchingRows
          .map((row) => row[valueColumnIndexes[0]])
          .filter(
            (val) => val !== null && val !== undefined && !isNaN(Number(val)),
          )
          .map(Number);

        const average =
          values.length > 0
            ? values.reduce((sum, val) => sum + val, 0) / values.length
            : null;

        mainRow.push(average as any);
        if (average !== null) {
          mainRowValues.push(average);
        }
      } else {
        mainRow.push(null);
      }
    });

    // Add row aggregation for main row if requested
    if (showRowAggregation) {
      const matchingRows = data.rows.filter(
        (r) => r[rowColumnIndexes[0]] === primaryValue,
      );
      const mainRowAggregation = calculateRowAggregation(
        data,
        matchingRows,
        mainRowValues,
      );
      mainRow.push(mainRowAggregation as any);
    }

    hierarchicalRows.push(mainRow);

    // Get all sub-combinations for this primary value
    const subRows = data.rows.filter(
      (row) => row[rowColumnIndexes[0]] === primaryValue,
    );

    // Create a key for sub-dimensions (excluding the primary dimension)
    const subDimensionIndexes = rowColumnIndexes.slice(1);
    const createSubKey = (row: any[]) =>
      subDimensionIndexes.map((index) => row[index]).join("|");

    const uniqueSubKeys = _.uniq(subRows.map(createSubKey));

    uniqueSubKeys.forEach((subKey) => {
      const subValues = subKey.split("|");
      const subLabel =
        subValues.length > 1 ? subValues.join(" - ") : subValues[0];

      // Create sub-row with matrix values and proper indentation
      const subRow = [`\u00A0\u00A0\u00A0\u00A0${subLabel}`]; // Use non-breaking spaces for indentation
      const subRowValues: number[] = [];

      // Fill in values for each column dimension
      uniqueColumnValues.forEach((columnValue) => {
        const matchingRow = subRows.find(
          (row) =>
            subDimensionIndexes.every(
              (colIndex, i) => row[colIndex] === subValues[i],
            ) && row[columnDimensionIndex] === columnValue,
        );

        const cellValue = matchingRow
          ? matchingRow[valueColumnIndexes[0]]
          : null;
        subRow.push(cellValue as any);

        if (
          cellValue !== null &&
          cellValue !== undefined &&
          !isNaN(Number(cellValue))
        ) {
          subRowValues.push(Number(cellValue));
        }
      });

      // Add row aggregation for sub-row if requested
      if (showRowAggregation) {
        const matchingRows = subRows.filter((row) =>
          subDimensionIndexes.every(
            (colIndex, i) => row[colIndex] === subValues[i],
          ),
        );
        const subRowAggregation = calculateRowAggregation(
          data,
          matchingRows,
          subRowValues,
        );
        subRow.push(subRowAggregation as any);
      }

      hierarchicalRows.push(subRow);
    });
  });

  return {
    cols: newCols,
    rows: hierarchicalRows,
    results_timezone: data.results_timezone,
  };
}

export function checkSQLPivotRenderable(
  data: DatasetData,
  settings: SQLPivotSettings,
) {
  if (!isSQLPivotSensible(data)) {
    throw new Error(
      t`SQL Pivot requires at least one text column and one numeric column.`,
    );
  }

  const rawRowColumns = settings["sqlpivot.row_columns"];
  const columnDimensionName = settings["sqlpivot.column_dimension"];
  const rawValueColumns = settings["sqlpivot.value_columns"];

  // Handle both string and array cases for row columns
  let rowColumnNames: string[] = [];
  if (typeof rawRowColumns === "string") {
    rowColumnNames = [rawRowColumns];
  } else if (Array.isArray(rawRowColumns)) {
    rowColumnNames = rawRowColumns;
  }

  // Handle both string and array cases for value columns
  let valueColumnNames: string[] = [];
  if (typeof rawValueColumns === "string") {
    valueColumnNames = [rawValueColumns];
  } else if (Array.isArray(rawValueColumns)) {
    valueColumnNames = rawValueColumns;
  }

  if (rowColumnNames.length === 0) {
    throw new Error(
      t`Please select at least one row column for the pivot table.`,
    );
  }

  if (valueColumnNames.length === 0) {
    throw new Error(
      t`Please select at least one value column for the pivot table.`,
    );
  }

  // Validate column dimension if provided
  if (columnDimensionName && rowColumnNames.includes(columnDimensionName)) {
    throw new Error(
      t`Row dimensions and column dimension cannot contain the same column.`,
    );
  }
}
