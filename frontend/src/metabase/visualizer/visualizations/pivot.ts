import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  isDraggedWellItem,
} from "metabase/visualizer/utils";
import type { VisualizationSettings } from "metabase-types/api";
import type { VisualizerState } from "metabase-types/store/visualizer";

export const pivotDropHandler = (
  state: VisualizerState,
  { active, over }: DragEndEvent,
) => {
  if (over && isDraggedColumnItem(active)) {
    const { column, dataSource } = active.data.current;
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      extractReferencedColumns(state.columnValuesMapping),
    );

    const columnType = getColumnTypeFromWellId(over.id);
    if (columnType) {
      const nextSettings = addColumnToVizSettings(
        state.settings,
        columnRef.name,
        columnType,
      );
      if (nextSettings) {
        state.settings = nextSettings;
        state.columns.push({
          ...column,
          name: columnRef.name,
          source: column.source === "breakout" ? "breakout" : "artificial",
        });
        state.columnValuesMapping[columnRef.name] = [columnRef];
      }
    }
  }

  if (over && isDraggedWellItem(active) && isPivotWell(over.id)) {
    const { column, wellId } = active.data.current;

    const previousColumnType = getColumnTypeFromWellId(wellId);
    const nextColumnType = getColumnTypeFromWellId(over.id);

    if (previousColumnType && nextColumnType) {
      const nextSettings = addColumnToVizSettings(
        removeColumnFromVizSettings(
          state.settings,
          column.name,
          previousColumnType,
        ),
        column.name,
        nextColumnType,
      );
      if (nextSettings) {
        state.settings = nextSettings;
      }
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
  state: VisualizerState,
  columnName: string,
  wellId: string,
) {
  const columnType = getColumnTypeFromWellId(wellId);
  if (columnType) {
    state.settings = removeColumnFromVizSettings(
      state.settings,
      columnName,
      columnType,
    );
    state.columns = state.columns.filter(col => col.name !== columnName);
    delete state.columnValuesMapping[columnName];
  }
}

function addColumnToVizSettings(
  settings: VisualizationSettings,
  columnName: string,
  columnType: "columns" | "rows" | "values",
): VisualizationSettings | null {
  const columnSplit = settings["pivot_table.column_split"] ?? {
    columns: [],
    rows: [],
    values: [],
  };
  const list = columnSplit[columnType];

  if (list.includes(columnName)) {
    return null;
  }

  return {
    ...settings,
    "pivot_table.column_split": {
      ...columnSplit,
      [columnType]: [...list, columnName],
    },
  };
}

function removeColumnFromVizSettings(
  settings: VisualizationSettings,
  columnName: string,
  columnType: "columns" | "rows" | "values",
) {
  const columnSplit = settings["pivot_table.column_split"] ?? {
    columns: [],
    rows: [],
    values: [],
  };
  const list = columnSplit[columnType];
  return {
    ...settings,
    "pivot_table.column_split": {
      ...columnSplit,
      [columnType]: list.filter(col => col !== columnName),
    },
  };
}

function getColumnTypeFromWellId(wellId: string | number) {
  if (wellId === DROPPABLE_ID.PIVOT_COLUMNS_WELL) {
    return "columns";
  }
  if (wellId === DROPPABLE_ID.PIVOT_ROWS_WELL) {
    return "rows";
  }
  if (wellId === DROPPABLE_ID.PIVOT_VALUES_WELL) {
    return "values";
  }
  return null;
}

function isPivotWell(wellId: string | number) {
  return (
    typeof wellId === "string" &&
    [
      DROPPABLE_ID.PIVOT_COLUMNS_WELL,
      DROPPABLE_ID.PIVOT_ROWS_WELL,
      DROPPABLE_ID.PIVOT_VALUES_WELL,
    ].includes(wellId)
  );
}
