import type { DragEndEvent } from "@dnd-kit/core";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import {
  isDimension,
  isMetric,
  isNumeric,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  VisualizerColumnReference,
  VisualizerDataSource,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { removeColumnFromStateUnlessUsedElseWhere } from "./utils";

export const pieDropHandler = (
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  { active, over }: DragEndEvent,
) => {
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (over.id === DROPPABLE_ID.PIE_METRIC && isNumeric(column)) {
    let metricColumnName = settings["pie.metric"];

    if (!metricColumnName) {
      metricColumnName = columnRef.name;
      state.columns.push(
        copyColumn(metricColumnName, column, dataSource.name, state.columns),
      );
    } else {
      const index = state.columns.findIndex(
        (col) => col.name === metricColumnName,
      );
      state.columns[index] = copyColumn(
        metricColumnName,
        column,
        dataSource.name,
        state.columns,
      );
    }

    if (metricColumnName) {
      state.columnValuesMapping[metricColumnName] = [columnRef];
    }
  }

  if (over.id === DROPPABLE_ID.PIE_DIMENSION) {
    const dimensions = settings["pie.dimension"] ?? [];
    const isInUse = dimensions.includes(columnRef.name);
    if (isInUse) {
      return;
    }

    const newDimension = copyColumn(
      columnRef.name,
      column,
      dataSource.name,
      state.columns,
    );
    state.columns.push(newDimension);
    state.columnValuesMapping[newDimension.name] = [columnRef];
    state.settings = {
      ...state.settings,
      "pie.dimension": [...dimensions, newDimension.name],
    };
  }
};

export function findColumnSlotForPieChart(parameters: {
  settings: ComputedVisualizationSettings;
  column: DatasetColumn;
}) {
  const { settings, column } = parameters;
  const ownMetric = settings["pie.metric"];
  if (!ownMetric && isMetric(column)) {
    return "pie.metric";
  }
  if (isDimension(column) && !isMetric(column)) {
    return "pie.dimensions";
  }
}

export function addColumnToPieChart(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
) {
  const slot = findColumnSlotForPieChart({
    settings,
    column,
  });
  if (slot) {
    state.columns.push(column);
    state.columnValuesMapping[column.name] = [columnRef];
  }
  if (slot === "pie.dimensions") {
    const dimensions = state.settings["pie.dimension"] ?? [];
    state.settings["pie.dimension"] = [...dimensions, column.name];
  } else if (slot === "pie.metric") {
    state.settings["pie.metric"] = column.name;
  }
}

export function removeColumnFromPieChart(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  columnName: string,
) {
  const dimensions = Array.isArray(settings["pie.dimension"])
    ? settings["pie.dimension"]
    : [settings["pie.dimension"]].filter(isNotNull);

  if (dimensions.includes(columnName)) {
    state.settings["pie.dimension"] = dimensions.filter(
      (dimension) => dimension !== columnName,
    );
  }

  if (settings["pie.metric"] === columnName) {
    delete state.settings["pie.metric"];
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "pie.metric",
    "pie.dimension",
  ]);
}

export function combineWithPieChart(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  { data }: Dataset,
  dataSource: VisualizerDataSource,
) {
  const metrics = data.cols.filter((col) => isMetric(col));
  const dimensions = data.cols.filter(
    (col) => isDimension(col) && !isMetric(col),
  );

  if (!settings["pie.metric"] && metrics.length === 1) {
    const [metric] = metrics;
    const columnRef = createVisualizerColumnReference(
      dataSource,
      metric,
      extractReferencedColumns(state.columnValuesMapping),
    );
    const column = copyColumn(
      columnRef.name,
      metric,
      dataSource.name,
      state.columns,
    );
    addColumnToPieChart(state, settings, data.cols, column, columnRef);
  }

  if (_.isEmpty(settings["pie.dimension"]) && dimensions.length === 1) {
    const [dimension] = dimensions;
    const columnRef = createVisualizerColumnReference(
      dataSource,
      dimension,
      extractReferencedColumns(state.columnValuesMapping),
    );
    const column = copyColumn(
      columnRef.name,
      dimension,
      dataSource.name,
      state.columns,
    );
    addColumnToPieChart(state, settings, data.cols, column, columnRef);
  }
}
