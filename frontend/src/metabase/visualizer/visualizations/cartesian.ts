import type { DragEndEvent } from "@dnd-kit/core";

import { isCartesianChart } from "metabase/visualizations";
import {
  getDefaultDimensionFilter,
  getDefaultMetricFilter,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  canCombineCard,
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  shouldSplitVisualizerSeries,
} from "metabase/visualizer/utils";
import { isCategory, isDate } from "metabase-lib/v1/types/utils/isa";
import type { Card, DatasetColumn } from "metabase-types/api";
import type {
  VisualizerColumnReference,
  VisualizerDataSource,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

export const cartesianDropHandler = (
  state: VisualizerHistoryItem,
  { active, over }: DragEndEvent,
) => {
  if (!over) {
    return;
  }

  if (!isDraggedColumnItem(active)) {
    return;
  }

  if (!state.display) {
    return;
  }

  const { column, dataSource } = active.data.current;

  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    const isSuitableColumn = getDefaultDimensionFilter(state.display);

    if (isSuitableColumn(column)) {
      addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
    }
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    const isSuitableColumn = getDefaultMetricFilter(state.display);

    if (isSuitableColumn(column)) {
      addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
    }
  }

  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    let bubbleColumnName = state.settings["scatter.bubble"];

    if (!bubbleColumnName) {
      bubbleColumnName = columnRef.name;
      state.columns.push(
        copyColumn(bubbleColumnName, column, dataSource.name, state.columns),
      );
      state.settings["scatter.bubble"] = bubbleColumnName;
    }

    state.columnValuesMapping[bubbleColumnName] = [columnRef];
  }
};

export function addMetricColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const metrics = state.settings["graph.metrics"] ?? [];
  const isInUse = metrics.includes(columnRef.name);
  if (isInUse) {
    return;
  }

  const newMetric = copyColumn(
    columnRef.name,
    column,
    dataSource.name,
    state.columns,
  );
  state.columns.push(newMetric);
  state.columnValuesMapping[newMetric.name] = [columnRef];
  state.settings = {
    ...state.settings,
    "graph.metrics": [...metrics, newMetric.name],
  };
}

export function addDimensionColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const dimensions = state.settings["graph.dimensions"] ?? [];
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
    "graph.dimensions": [...dimensions, newDimension.name],
  };
}

export function addColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  card?: Card,
) {
  if (!state.display || !["area", "bar", "line"].includes(state.display)) {
    return;
  }

  if (!card) {
    return;
  }

  const ownMetrics = state.settings["graph.metrics"] ?? [];
  const ownDimensions = state.settings["graph.dimensions"] ?? [];

  if (
    ownDimensions.length === 0 ||
    canCombineCard(state.display, state.columns, state.settings, card)
  ) {
    const metrics = card.visualization_settings["graph.metrics"] ?? [];
    const dimensions = card.visualization_settings["graph.dimensions"] ?? [];

    const isMetric = metrics.includes(columnRef.originalName);
    const isDimension = dimensions.includes(columnRef.originalName);

    if (isMetric) {
      state.settings["graph.metrics"] = [...ownMetrics, column.name];
    }

    if (isDimension) {
      state.settings["graph.dimensions"] = [...ownDimensions, column.name];
    }
  }
}

export function removeColumnFromCartesianChart(
  state: VisualizerHistoryItem,
  columnName: string,
) {
  const isMultiseries =
    state.display &&
    isCartesianChart(state.display) &&
    shouldSplitVisualizerSeries(state.columnValuesMapping, state.settings);

  if (state.settings["graph.dimensions"]) {
    const dimensions = state.settings["graph.dimensions"];
    const isDimension = dimensions.includes(columnName);

    if (isDimension) {
      if (isMultiseries) {
        removeDimensionFromMultiSeriesChart(state, columnName);
      } else {
        state.settings["graph.dimensions"] = dimensions.filter(
          dimension => dimension !== columnName,
        );
      }
    }
  }

  if (state.settings["graph.metrics"]) {
    const metrics = state.settings["graph.metrics"];
    state.settings["graph.metrics"] = metrics.filter(
      metric => metric !== columnName,
    );
  }

  if (state.settings["scatter.bubble"] === columnName) {
    delete state.settings["scatter.bubble"];
  }
}

function removeDimensionFromMultiSeriesChart(
  state: VisualizerHistoryItem,
  columnName: string,
) {
  const originalDimensions = [...(state.settings["graph.dimensions"] ?? [])];

  const dimensionColumnMap = Object.fromEntries(
    originalDimensions.map(dimension => [
      dimension,
      state.columns.find(col => col.name === dimension),
    ]),
  );
  const column = dimensionColumnMap[columnName];

  // For multi-series charts, we need a dimension from each data source
  // to plot the data correctly. When a dimension is removed, we need to remove
  // all dimensions of the same type to avoid invalid states.
  if (isDate(column)) {
    state.settings["graph.dimensions"] = originalDimensions.filter(
      name => !isDate(dimensionColumnMap[name]),
    );
  } else if (isCategory(column)) {
    state.settings["graph.dimensions"] = originalDimensions.filter(
      name => !isCategory(dimensionColumnMap[name]),
    );
  }

  const removedColumns = originalDimensions.filter(
    name => !state.settings["graph.dimensions"]?.includes(name),
  );

  removedColumns.forEach(name => {
    state.columns = state.columns.filter(col => col.name !== name);
    delete state.columnValuesMapping[name];
  });
}
