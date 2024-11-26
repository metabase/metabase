import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  isDraggedWellItem,
} from "metabase/visualizer/utils";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

export const pivotDropHandler = (
  state: VisualizerHistoryItem,
  { active, over }: DragEndEvent,
) => {
  if (over && isDraggedColumnItem(active)) {
    let shouldAddColumn = false;

    const { column, dataSource } = active.data.current;
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      extractReferencedColumns(state.columnValuesMapping),
    );

    if (over.id === DROPPABLE_ID.PIVOT_COLUMNS_WELL) {
      const columns = state.settings["pivot_table.column_split"]?.columns ?? [];
      if (!columns.includes(columnRef.name)) {
        state.settings = {
          ...state.settings,
          "pivot_table.column_split": {
            ...(state.settings["pivot_table.column_split"] ?? {
              rows: [],
              values: [],
            }),
            columns: [...columns, columnRef.name],
          },
        };
        shouldAddColumn = true;
      }
    } else if (over.id === DROPPABLE_ID.PIVOT_ROWS_WELL) {
      const rows = state.settings["pivot_table.column_split"]?.rows ?? [];
      if (!rows.includes(columnRef.name)) {
        state.settings = {
          ...state.settings,
          "pivot_table.column_split": {
            ...(state.settings["pivot_table.column_split"] ?? {
              columns: [],
              values: [],
            }),
            rows: [...rows, columnRef.name],
          },
        };
        shouldAddColumn = true;
      }
    } else if (over.id === DROPPABLE_ID.PIVOT_VALUES_WELL) {
      const values = state.settings["pivot_table.column_split"]?.values ?? [];
      if (!values.includes(columnRef.name)) {
        state.settings = {
          ...state.settings,
          "pivot_table.column_split": {
            ...(state.settings["pivot_table.column_split"] ?? {
              columns: [],
              rows: [],
            }),
            values: [...values, columnRef.name],
          },
        };
        shouldAddColumn = true;
      }
    }

    if (shouldAddColumn) {
      state.columns.push({
        ...column,
        name: columnRef.name,
        source: column.source === "breakout" ? "breakout" : "artificial",
      });
      state.columnValuesMapping[columnRef.name] = [columnRef];
    }
  }

  if (
    isDraggedWellItem(active) &&
    (!over || over.id === DROPPABLE_ID.CANVAS_MAIN)
  ) {
    const { column, wellId } = active.data.current;
    removeColumnFromPivotTable(state, column.name, wellId);
  }
};

export function removeColumnFromPivotTable(
  state: VisualizerHistoryItem,
  columnName: string,
  wellId: string,
) {
  if (wellId === DROPPABLE_ID.PIVOT_COLUMNS_WELL) {
    const columns = state.settings["pivot_table.column_split"]?.columns ?? [];
    state.settings = {
      ...state.settings,
      "pivot_table.column_split": {
        ...(state.settings["pivot_table.column_split"] ?? {
          rows: [],
          values: [],
        }),
        columns: columns.filter(col => col !== columnName),
      },
    };
    state.columns = state.columns.filter(col => col.name !== columnName);
    delete state.columnValuesMapping[columnName];
  }
  if (wellId === DROPPABLE_ID.PIVOT_ROWS_WELL) {
    const rows = state.settings["pivot_table.column_split"]?.rows ?? [];
    state.settings = {
      ...state.settings,
      "pivot_table.column_split": {
        ...(state.settings["pivot_table.column_split"] ?? {
          columns: [],
          values: [],
        }),
        rows: rows.filter(col => col !== columnName),
      },
    };
    state.columns = state.columns.filter(col => col.name !== columnName);
    delete state.columnValuesMapping[columnName];
  }
  if (wellId === DROPPABLE_ID.PIVOT_VALUES_WELL) {
    const values = state.settings["pivot_table.column_split"]?.values ?? [];
    state.settings = {
      ...state.settings,
      "pivot_table.column_split": {
        ...(state.settings["pivot_table.column_split"] ?? {
          columns: [],
          rows: [],
        }),
        values: values.filter(col => col !== columnName),
      },
    };
    state.columns = state.columns.filter(col => col.name !== columnName);
    delete state.columnValuesMapping[columnName];
  }
}
