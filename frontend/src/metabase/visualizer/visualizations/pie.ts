import type { DragEndEvent } from "@dnd-kit/core";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
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
  VisualizerVizDefinition,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { removeColumnFromStateUnlessUsedElseWhere } from "./utils";

export const pieDropHandler = (
  state: VisualizerVizDefinitionWithColumns,
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
    let metricColumnName = state.settings["pie.metric"];

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
    const dimensions = state.settings["pie.dimension"] ?? [];
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

export function findColumnSlotForPieChart(
  { settings }: Pick<VisualizerVizDefinition, "settings">,
  datasets: Record<string, Dataset>,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
) {
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
  datasets: Record<string, Dataset>,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
) {
  const slot = findColumnSlotForPieChart(
    state,
    datasets,
    dataSourceColumns,
    column,
  );
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
  columnName: string,
) {
  const dimensions = Array.isArray(state.settings["pie.dimension"])
    ? state.settings["pie.dimension"]
    : [state.settings["pie.dimension"]].filter(isNotNull);

  if (dimensions.includes(columnName)) {
    state.settings["pie.dimension"] = dimensions.filter(
      (dimension) => dimension !== columnName,
    );
  }

  if (state.settings["pie.metric"] === columnName) {
    delete state.settings["pie.metric"];
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "pie.metric",
    "pie.dimension",
  ]);
}

export function combineWithPieChart(
  state: VisualizerVizDefinitionWithColumns,
  datasets: Record<string, Dataset>,
  { data }: Dataset,
  dataSource: VisualizerDataSource,
) {
  const metrics = data.cols.filter((col) => isMetric(col));
  const dimensions = data.cols.filter(
    (col) => isDimension(col) && !isMetric(col),
  );

  if (!state.settings["pie.metric"] && metrics.length === 1) {
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
    addColumnToPieChart(state, datasets, data.cols, column, columnRef);
  }

  if (_.isEmpty(state.settings["pie.dimension"]) && dimensions.length === 1) {
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
    addColumnToPieChart(state, datasets, data.cols, column, columnRef);
  }
}
