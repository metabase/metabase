import type { DragEndEvent } from "@dnd-kit/core";
import type { Draft } from "immer";
import _ from "underscore";

import { isCartesianChart } from "metabase/visualizations";
import {
  getDefaultDimensionFilter,
  getDefaultMetricFilter,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  shouldSplitVisualizerSeries,
} from "metabase/visualizer/utils";
import {
  isDate,
  isDimension,
  isMetric,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  VisualizerColumnReference,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { removeColumnFromStateUnlessUsedElseWhere } from "./utils";

export const cartesianDropHandler = (
  state:
    | Draft<VisualizerVizDefinitionWithColumns>
    | VisualizerVizDefinitionWithColumns,
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
      maybeImportDimensionsFromOtherDataSources(
        state,
        column,
        _.omit(datasetMap, dataSource.id),
        dataSourceMap,
      );
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
  state: VisualizerVizDefinitionWithColumns,
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
    state.columns = state.columns.filter(
      (col) => col.name !== currentBubbleName,
    );
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
  state: VisualizerVizDefinitionWithColumns,
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
  state: VisualizerVizDefinitionWithColumns,
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

export function findColumnSlotForCartesianChart(
  {
    display,
    columns,
    settings,
  }: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  datasets: Record<VisualizerDataSourceId, Dataset>,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
) {
  if (display === "scatter") {
    const metrics = settings["graph.metrics"] ?? [];
    const dimensions = settings["graph.dimensions"] ?? [];
    const bubble = settings["scatter.bubble"];

    const couldBeMetric = getDefaultMetricFilter("scatter")(column);
    const couldBeDimension = getDefaultDimensionFilter("scatter")(column);

    if (metrics.length === 0 && couldBeMetric) {
      return "graph.metrics";
    } else if (dimensions.length === 0 && couldBeDimension) {
      return "graph.dimensions";
    } else if (!bubble && couldBeMetric) {
      return "scatter.bubble";
    }
  } else {
    if (isDimension(column) && !isMetric(column)) {
      // Filtering out nulls as 'graph.dimensions' can be `[null]` sometimes
      const ownDimensions = settings["graph.dimensions"]?.filter(Boolean) ?? [];
      if (ownDimensions.length === 0) {
        return "graph.dimensions";
      } else {
        const isCompatibleWithUsedColumns = columns.some((col) => {
          if (isDate(col)) {
            return isDate(column);
          } else {
            return col.id === column.id;
          }
        });
        if (isCompatibleWithUsedColumns) {
          return "graph.dimensions";
        }

        // Handles potential new dimensions that are not yet used in a chart
        // For example, a chart could show several metrics over time (from different data sources)
        // And each data source can have a "User → Source" column. This check ensure that
        // dimensions are considered mappable in this case if they're present in every data source.
        const isCompatibleWithUnusedColumns = Object.values(datasets).every(
          (dataset) =>
            dataset.data.cols.some((col) => {
              if (isDate(col)) {
                return isDate(column);
              } else {
                return col.id === column.id;
              }
            }),
        );

        return isCompatibleWithUnusedColumns ? "graph.dimensions" : undefined;
      }
    } else if (isMetric(column)) {
      return "graph.metrics";
    }
  }
}

/**
 * This adds a column to a cartesian chart, either as a dimension or a metric.
 * It tries to be "smart", in the sense that it will add the column where it makes sense.
 * If the column is already in use, it will not be added again.
 */
export function addColumnToCartesianChart(
  state:
    | Draft<VisualizerVizDefinitionWithColumns>
    | VisualizerVizDefinitionWithColumns,
  datasets: Record<string, Dataset>,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const slot = findColumnSlotForCartesianChart(
    state,
    datasets,
    dataSourceColumns,
    column,
  );
  if (slot === "graph.dimensions") {
    addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
  } else if (slot === "graph.metrics") {
    addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
  } else if (slot === "scatter.bubble") {
    replaceMetricColumnAsScatterBubbleSize(
      state,
      column,
      columnRef,
      dataSource,
    );
  }
}

/**
 * Removes the bubble size from the state, for scatter charts.
 *
 * @param state the current state (will be mutated)
 * @param columnName the column to remove
 */
export function removeBubbleSizeFromCartesianChart(
  state: VisualizerVizDefinitionWithColumns,
  columnName: string,
) {
  if (state.settings["scatter.bubble"] === columnName) {
    delete state.settings["scatter.bubble"];
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "graph.metrics",
    "graph.dimensions",
    "scatter.bubble",
  ]);
}

/**
 * Removes a column from the state, for cartesian charts.
 *
 * @param state the current state (will be mutated)
 * @param columnName the column to remove
 */
export function removeColumnFromCartesianChart(
  state: VisualizerVizDefinitionWithColumns,
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
          (dimension) => dimension !== columnName,
        );
      }
    }
  }

  if (state.settings["graph.metrics"]) {
    const metrics = state.settings["graph.metrics"];
    state.settings["graph.metrics"] = metrics.filter(
      (metric) => metric !== columnName,
    );
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "graph.metrics",
    "graph.dimensions",
    "scatter.bubble",
  ]);
}

function removeDimensionFromMultiSeriesChart(
  state: VisualizerVizDefinitionWithColumns,
  columnName: string,
) {
  const originalDimensions = [...(state.settings["graph.dimensions"] ?? [])];

  const dimensionColumnMap = Object.fromEntries(
    originalDimensions.map((dimension) => [
      dimension,
      state.columns.find((col) => col.name === dimension),
    ]),
  );
  const column = dimensionColumnMap[columnName];

  // For multi-series charts, we need a dimension from each data source
  // to plot the data correctly. When a dimension is removed, we need to remove
  // all dimensions of the same type to avoid invalid states.
  if (isDate(column)) {
    state.settings["graph.dimensions"] = originalDimensions.filter(
      (name) => !isDate(dimensionColumnMap[name]),
    );
  } else if (isString(column)) {
    state.settings["graph.dimensions"] = originalDimensions.filter(
      (name) => !isString(dimensionColumnMap[name]),
    );
  }

  const removedColumns = originalDimensions.filter(
    (name) => !state.settings["graph.dimensions"]?.includes(name),
  );

  removedColumns.forEach((name) => {
    state.columns = state.columns.filter((col) => col.name !== name);
    delete state.columnValuesMapping[name];
  });
}

export function maybeImportDimensionsFromOtherDataSources(
  state:
    | Draft<VisualizerVizDefinitionWithColumns>
    | VisualizerVizDefinitionWithColumns,
  newDimension: DatasetColumn,
  datasetMap: Record<string, Dataset>,
  dataSourceMap: Record<string, VisualizerDataSource>,
) {
  Object.entries(datasetMap).forEach(([dataSourceId, dataset]) => {
    const dataSource = dataSourceMap[dataSourceId];

    let matchingDimension: DatasetColumn | undefined = undefined;
    if (isDate(newDimension)) {
      const dimensions = dataset.data.cols.filter(
        (col) => isDimension(col) && !isMetric(col),
      );
      matchingDimension = dimensions.find(isDate);
    } else if (newDimension.id) {
      matchingDimension = dataset.data.cols.find(
        (col) => col.id === newDimension.id,
      );
    }

    if (matchingDimension) {
      const columnRef = createVisualizerColumnReference(
        dataSource,
        matchingDimension,
        extractReferencedColumns(state.columnValuesMapping),
      );
      addDimensionColumnToCartesianChart(
        state,
        matchingDimension,
        columnRef,
        dataSource,
      );
    }
  });
}

export function combineWithCartesianChart(
  state: VisualizerVizDefinitionWithColumns,
  datasets: Record<string, Dataset>,
  dataset: Dataset,
  dataSource: VisualizerDataSource,
) {
  const { data } = dataset;

  const metrics = data.cols.filter((col) => isMetric(col));
  const dimensions = data.cols.filter(
    (col) => isDimension(col) && !isMetric(col),
  );

  metrics.forEach((column) => {
    const isCompatible = !!findColumnSlotForCartesianChart(
      state,
      datasets,
      dataset.data.cols,
      column,
    );
    if (isCompatible) {
      const columnRef = createVisualizerColumnReference(
        dataSource,
        column,
        extractReferencedColumns(state.columnValuesMapping),
      );
      addMetricColumnToCartesianChart(state, column, columnRef, dataSource);
    }
  });

  dimensions.forEach((column) => {
    const isCompatible = !!findColumnSlotForCartesianChart(
      state,
      datasets,
      dataset.data.cols,
      column,
    );
    if (isCompatible) {
      const columnRef = createVisualizerColumnReference(
        dataSource,
        column,
        extractReferencedColumns(state.columnValuesMapping),
      );
      addDimensionColumnToCartesianChart(state, column, columnRef, dataSource);
    }
  });
}
