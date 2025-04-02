import type { DragEndEvent } from "@dnd-kit/core";
import _ from "underscore";

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
import type { Card, Dataset, DatasetColumn } from "metabase-types/api";
import type {
  VisualizerColumnReference,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

export const cartesianDropHandler = (
  state: VisualizerHistoryItem,
  { active, over }: DragEndEvent,
  {
    dataSourceMap,
    datasetMap,
  }: {
    dataSourceMap: Record<VisualizerDataSourceId, VisualizerDataSource>;
    datasetMap: Record<VisualizerDataSourceId, Dataset>;
  },
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
      if (column.id) {
        maybeImportDimensionsFromOtherDataSources(
          state,
          column.id,
          _.omit(datasetMap, dataSource.id),
          dataSourceMap,
        );
      }
    }
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    const isSuitableColumn = getDefaultMetricFilter(state.display);

    if (isSuitableColumn(column)) {
      addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
    }
  }

  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    replaceMetricColumnAsScatterBubbleSize(
      state,
      column,
      columnRef,
      dataSource,
    );
  }
};

export function replaceMetricColumnAsScatterBubbleSize(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const metrics = state.settings["graph.metrics"] ?? [];
  const dimensions = state.settings["graph.dimensions"] ?? [];
  const currentBubbleName = state.settings["scatter.bubble"];

  // Remove the current bubble column if it's not in use elsewhere
  if (
    currentBubbleName &&
    !metrics.includes(currentBubbleName) &&
    !dimensions.includes(currentBubbleName)
  ) {
    state.columns = state.columns.filter(col => col.name !== currentBubbleName);
    delete state.columnValuesMapping[currentBubbleName];
  }

  const newColumnName = columnRef.name;
  const alreadyInUseElsewhere =
    metrics.includes(newColumnName) || dimensions.includes(newColumnName);

  if (!alreadyInUseElsewhere) {
    state.columns.push(
      copyColumn(newColumnName, column, dataSource.name, state.columns),
    );
  }
  state.settings["scatter.bubble"] = newColumnName;

  state.columnValuesMapping[newColumnName] = [columnRef];
}

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

/**
 * This adds a column to a cartesian chart, either as a dimension or a metric.
 * It tries to be "smart", in the sense that it will add the column where it makes sense.
 * If the column is already in use, it will not be added again.
 */
export function addColumnToCartesianChart(
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
  card?: Card,
) {
  if (
    !state.display ||
    !["area", "bar", "line", "scatter"].includes(state.display)
  ) {
    return;
  }

  if (state.display === "scatter") {
    const metrics = state.settings["graph.metrics"] ?? [];
    const dimensions = state.settings["graph.dimensions"] ?? [];
    const bubble = state.settings["scatter.bubble"];

    const couldBeMetric = getDefaultMetricFilter("scatter")(column);
    const couldBeDimension = getDefaultDimensionFilter("scatter")(column);

    if (metrics.length === 0 && couldBeMetric) {
      addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
    } else if (dimensions.length === 0 && couldBeDimension) {
      addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
    } else if (!bubble && couldBeMetric) {
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column,
        columnRef,
        dataSource,
      );
    }
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

/**
 * Removes the bubble size from the state, for scatter charts.
 *
 * @param state the current state (will be mutated)
 * @param columnName the column to remove
 */
export function removeBubbleSizeFromCartesianChart(
  state: VisualizerHistoryItem,
  columnName: string,
) {
  if (state.settings["scatter.bubble"] === columnName) {
    delete state.settings["scatter.bubble"];
  }
}

/**
 * Removes a column from the state, for cartesian charts.
 *
 * @param state the current state (will be mutated)
 * @param columnName the column to remove
 */
export function removeColumnFromCartesianChart(
  state: VisualizerHistoryItem,
  columnName: string,
  well?: "bubble",
) {
  if (well === "bubble") {
    removeBubbleSizeFromCartesianChart(state, columnName);
    return;
  }

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

export function maybeImportDimensionsFromOtherDataSources(
  state: VisualizerHistoryItem,
  dimensionId: number,
  datasetMap: Record<string, Dataset>,
  dataSourceMap: Record<string, VisualizerDataSource>,
) {
  Object.entries(datasetMap).forEach(([dataSourceId, dataset]) => {
    const dataSource = dataSourceMap[dataSourceId];
    const matchingDimension = dataset.data.cols.find(
      col => col.id === dimensionId,
    );
    if (matchingDimension) {
      const columnRef = createVisualizerColumnReference(
        dataSource,
        matchingDimension,
        extractReferencedColumns(state.columnValuesMapping),
      );
      const column = copyColumn(
        columnRef.name,
        matchingDimension,
        dataSource.name,
        state.columns,
      );

      state.columns.push(column);
      state.columnValuesMapping[column.name] = [columnRef];
      if (!state.settings["graph.dimensions"]) {
        state.settings["graph.dimensions"] = [];
      }
      state.settings["graph.dimensions"].push(column.name);
    }
  });
}
