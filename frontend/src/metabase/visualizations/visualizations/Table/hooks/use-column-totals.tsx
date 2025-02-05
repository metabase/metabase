import type { Table } from "@tanstack/react-table";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isNumber } from "metabase-lib/v1/types/utils/isa";
import type {
  AggregationType,
  DatasetColumn,
  RowValue,
  RowValues,
} from "metabase-types/api";

import type { SelectedCell } from "./use-cell-selection";

const sum = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const avg = (values: number[]) => sum(values) / values.length;
const min = (values: number[]) => Math.min(...values);
const max = (values: number[]) => Math.max(...values);

const aggFunctionByName: Record<AggregationType, any> = {
  sum,
  count: sum,
  "cum-sum": max,
  max,
  min,
  avg,
};

const calculateColumnTotals = (
  cols: DatasetColumn[],
  rows: RowValues[],
  selectedValuesByColumnId: Map<string, RowValue[]>,
): ColumnTotal[] => {
  return cols.map((col, colIndex) => {
    const aggregationFunctionName = col.aggregation_function ?? "sum";
    const aggregationFunction = aggFunctionByName[aggregationFunctionName];
    if (
      isNumber(col) &&
      col.binning_info == null &&
      aggregationFunction != null
    ) {
      const selectedValues = selectedValuesByColumnId.get(col.name);
      const hasSelectedValues = selectedValues != null;
      const valuesToAggregate = hasSelectedValues
        ? selectedValues
        : rows.map(row => row[colIndex]).filter(isNotNull);

      return {
        value: aggregationFunction(valuesToAggregate),
        aggregation: aggregationFunctionName,
        isSelected: hasSelectedValues,
      };
    }

    return null;
  });
};

const getSelectedValuesByColumnId = (
  selectedCells: SelectedCell[],
  table: Table<unknown>,
): Map<string, RowValue[]> => {
  const selectedCellsByColumnId = selectedCells.reduce(
    (acc: Map<string, SelectedCell[]>, cell) => {
      if (!acc.has(cell.columnId)) {
        acc.set(cell.columnId, []);
      }
      acc.get(cell.columnId)?.push(cell);
      return acc;
    },
    new Map(),
  );

  const selectedColumnIds = Array.from(selectedCellsByColumnId.keys());

  const selectedCellByRowId = selectedCells.reduce(
    (acc: Map<string, SelectedCell[]>, cell) => {
      if (!acc.has(cell.rowId)) {
        acc.set(cell.rowId, []);
      }
      acc.get(cell.rowId)?.push(cell);
      return acc;
    },
    new Map(),
  );

  const selectedValuesByColumnId = new Map<string, RowValue[]>();
  const selectedRowIds = Array.from(selectedCellByRowId.keys());

  if (selectedRowIds.length < 2) {
    return new Map();
  }
  selectedRowIds.map(rowId => {
    const cellByColumnId = table.getRow(rowId)._getAllCellsByColumnId();
    selectedColumnIds.forEach(columnId => {
      const cell = cellByColumnId[columnId];

      if (!selectedValuesByColumnId.has(columnId)) {
        selectedValuesByColumnId.set(columnId, []);
      }
      selectedValuesByColumnId.get(columnId)?.push(cell.getValue());
    });
  });

  return selectedValuesByColumnId;
};

export type ColumnTotal = {
  value: number;
  isSelected: boolean;
  aggregation: string;
} | null;

export const useColumnTotals = (
  cols: DatasetColumn[],
  rows: RowValues[],
  settings: ComputedVisualizationSettings,
  selectedCells: SelectedCell[],
  table: Table<unknown>,
): ColumnTotal[] | null => {
  return useMemo(() => {
    if (!settings["table.column_totals"]) {
      return null;
    }

    const selectedValuesByColumnId = getSelectedValuesByColumnId(
      selectedCells,
      table,
    );
    const columnTotals = calculateColumnTotals(
      cols,
      rows,
      selectedValuesByColumnId,
    );
    if (columnTotals.every(total => total == null)) {
      return null;
    }

    return columnTotals;
  }, [cols, rows, selectedCells, settings, table]);
};
