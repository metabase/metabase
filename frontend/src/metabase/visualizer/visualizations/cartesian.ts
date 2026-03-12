import type { DragEndEvent } from "@dnd-kit/core";
import type { Draft } from "immer";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import { isCartesianChart } from "metabase/visualizations";
import {
  getDefaultDimensionFilter,
  getDefaultMetricFilter,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
  shouldSplitVisualizerSeries,
  updateVizSettingsWithRefs,
} from "metabase/visualizer/utils";
import {
  isDate,
  isDimension,
  isMetric,
  isNumeric,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  VisualizationSettings,
  VisualizerColumnReference,
  VisualizerDataSource,
  VisualizerDataSourceId,
  XAxisScale,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { removeColumnFromStateUnlessUsedElseWhere } from "./utils";

export const cartesianDropHandler = (
  state:
    | Draft<VisualizerVizDefinitionWithColumns>
    | VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
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
      addDimensionColumnToCartesianChart(
        state,
        settings,
        column,
        columnRef,
        dataSource,
      );
      maybeImportDimensionsFromOtherDataSources(
        state,
        settings,
        column,
        _.omit(datasetMap, dataSource.id),
        dataSourceMap,
      );
    }
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    const isSuitableColumn = getDefaultMetricFilter(state.display);

    if (isSuitableColumn(column)) {
      addMetricColumnToCartesianChart(
        state,
        settings,
        column,
        columnRef,
        dataSource,
      );
    }
  }

  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    replaceMetricColumnAsScatterBubbleSize(
      state,
      settings,
      column,
      columnRef,
      dataSource,
    );
  }
};

export function replaceMetricColumnAsScatterBubbleSize(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const metrics = settings["graph.metrics"] ?? [];
  const dimensions = settings["graph.dimensions"] ?? [];
  const currentBubbleName = settings["scatter.bubble"];

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
  settings: ComputedVisualizationSettings,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  // Viz settings are computed before doing any mutations,
  // so if we're adding several columns in one go,
  // we need to use state.settings to have an up-to-date list of values
  const metrics =
    state.settings["graph.metrics"] ?? settings["graph.metrics"] ?? [];

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
    "graph.metrics": [...metrics, newMetric.name].filter(Boolean),
  };
}

export function addDimensionColumnToCartesianChart(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  // Viz settings are computed before doing any mutations,
  // so if we're adding several columns in one go,
  // we need to use state.settings to have an up-to-date list of values
  const dimensions =
    state.settings["graph.dimensions"] ?? settings["graph.dimensions"] ?? [];
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
    "graph.dimensions": [...dimensions, newDimension.name].filter(Boolean),
  };
}

/**
 * Returns a slot where the column can be added to a cartesian chart,
 * or undefined if no suitable slot is found.
 *
 * @param state the current state of the visualizer
 * @param settings the computed visualization settings
 * @param datasets the selected datasets (not used )
 * @param dataSourceColumns the current data source columns (not used )
 * @param column the column to find a slot for
 * @returns a string representing the slot where the column should be added,
 *          or undefined if no suitable slot is found.
 */
export function findColumnSlotForCartesianChart(parameters: {
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >;
  settings: ComputedVisualizationSettings;
  column: DatasetColumn;
}) {
  const { state, settings, column } = parameters;
  if (state.display === "scatter") {
    const metrics = settings["graph.metrics"]?.filter(isNotNull) ?? [];
    const dimensions = settings["graph.dimensions"]?.filter(isNotNull) ?? [];
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
      return "graph.dimensions";
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
  settings: ComputedVisualizationSettings,
  datasets: Record<string, Dataset>,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataSource: VisualizerDataSource,
) {
  const slot = findColumnSlotForCartesianChart({
    state,
    settings,
    column,
  });
  if (slot === "graph.dimensions") {
    addDimensionColumnToCartesianChart(
      state,
      settings,
      column,
      columnRef,
      dataSource,
    );
  } else if (slot === "graph.metrics") {
    addMetricColumnToCartesianChart(
      state,
      settings,
      column,
      columnRef,
      dataSource,
    );
  } else if (slot === "scatter.bubble") {
    replaceMetricColumnAsScatterBubbleSize(
      state,
      settings,
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
  settings: ComputedVisualizationSettings,
  columnName: string,
) {
  const isMultiseries =
    state.display &&
    isCartesianChart(state.display) &&
    shouldSplitVisualizerSeries(state.columnValuesMapping);

  if (settings["graph.dimensions"]) {
    const dimensions = settings["graph.dimensions"];
    const isDimension = dimensions.includes(columnName);

    if (isDimension) {
      if (isMultiseries) {
        removeDimensionFromMultiSeriesChart(state, settings, columnName);
      } else {
        state.settings["graph.dimensions"] = dimensions
          .filter((dimension) => dimension !== columnName)
          .filter(Boolean);
      }
    }
  }

  if (settings["graph.metrics"]) {
    const metrics = settings["graph.metrics"];
    state.settings["graph.metrics"] = metrics
      .filter((metric) => metric !== columnName)
      .filter(Boolean);
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "graph.metrics",
    "graph.dimensions",
    "scatter.bubble",
  ]);
}

function removeDimensionFromMultiSeriesChart(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  columnName: string,
) {
  const originalDimensions = settings["graph.dimensions"] ?? [];

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
  settings: ComputedVisualizationSettings,
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
        settings,
        matchingDimension,
        columnRef,
        dataSource,
      );
    }
  });
}

function sortDimensionsByXAxisScale(
  dimensions: DatasetColumn[],
  xAxisScale: XAxisScale | undefined,
): DatasetColumn[] {
  if (!xAxisScale) {
    return dimensions;
  }

  const priorityPredicates: Record<
    XAxisScale,
    (col: DatasetColumn) => boolean
  > = {
    timeseries: (col) => isDate(col),
    linear: (col) => isNumeric(col),
    pow: (col) => isNumeric(col),
    log: (col) => isNumeric(col),
    histogram: (col) => isNumeric(col),
    ordinal: (col) => isString(col),
  };

  const priorityPredicate = priorityPredicates[xAxisScale];
  if (!priorityPredicate) {
    return dimensions;
  }

  return [...dimensions].sort((a, b) => {
    const aPriority = priorityPredicate(a);
    const bPriority = priorityPredicate(b);
    if (aPriority && !bPriority) {
      return -1;
    }
    if (!aPriority && bPriority) {
      return 1;
    }
    return 0;
  });
}

export function combineWithCartesianChart(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  dataset: Dataset,
  dataSource: VisualizerDataSource,
  vizSettings: VisualizationSettings | null = null,
) {
  const { data } = dataset;

  const metrics = data.cols.filter((col) => isMetric(col));
  const dimensions = data.cols.filter(
    (col) => isDimension(col) && !isMetric(col),
  );

  const columnsToRefs: Record<string, string> = {};

  metrics.forEach((column) => {
    const isCompatible = !!findColumnSlotForCartesianChart({
      state,
      settings,
      column,
    });
    if (isCompatible) {
      const columnRef = createVisualizerColumnReference(
        dataSource,
        column,
        extractReferencedColumns(state.columnValuesMapping),
      );
      addMetricColumnToCartesianChart(
        state,
        settings,
        column,
        columnRef,
        dataSource,
      );
      columnsToRefs[column.name] = columnRef.name;
    }
  });

  const sortedDimensions = sortDimensionsByXAxisScale(
    dimensions,
    settings["graph.x_axis.scale"],
  );

  sortedDimensions.forEach((column) => {
    const isCompatible = !!findColumnSlotForCartesianChart({
      state,
      settings,
      column,
    });
    if (isCompatible) {
      const columnRef = createVisualizerColumnReference(
        dataSource,
        column,
        extractReferencedColumns(state.columnValuesMapping),
      );
      addDimensionColumnToCartesianChart(
        state,
        settings,
        column,
        columnRef,
        dataSource,
      );
      columnsToRefs[column.name] = columnRef.name;
    }
  });

  if (vizSettings && vizSettings.column_settings) {
    const remappedSettings = updateVizSettingsWithRefs(
      vizSettings,
      columnsToRefs,
    );

    state.settings.column_settings = {
      ...state.settings.column_settings,
      ...remappedSettings.column_settings,
    };
  }
}
