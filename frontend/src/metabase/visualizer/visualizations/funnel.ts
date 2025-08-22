import type { DragEndEvent } from "@dnd-kit/core";
import type { Draft } from "immer";
import _ from "underscore";

import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  copyColumn,
  createDataSourceNameRef,
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

export const funnelDropHandler = (
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  { active, over }: DragEndEvent,
) => {
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
    addScalarToFunnel(state, settings, dataSource, column);
  }

  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (
    over.id === DROPPABLE_ID.X_AXIS_WELL &&
    isDimension(column) &&
    !isMetric(column)
  ) {
    let dimensionColumnName = settings["funnel.dimension"];
    if (!dimensionColumnName) {
      dimensionColumnName = columnRef.name;
      state.columns.push(
        copyColumn(dimensionColumnName, column, dataSource.name, state.columns),
      );
      state.settings["funnel.dimension"] = dimensionColumnName;
    } else {
      const index = state.columns.findIndex(
        (col) => col.name === dimensionColumnName,
      );
      state.columns[index] = copyColumn(
        dimensionColumnName,
        column,
        dataSource.name,
        state.columns,
      );
    }

    if (dimensionColumnName) {
      state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
        state.columnValuesMapping[dimensionColumnName],
        columnRef,
      );
    }
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL && isMetric(column)) {
    let metricColumnName = settings["funnel.metric"];
    if (!metricColumnName) {
      metricColumnName = columnRef.name;
      state.columns.push(
        copyColumn(metricColumnName, column, dataSource.name, state.columns),
      );
      state.settings["funnel.metric"] = metricColumnName;
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
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
    }
  }
};

export function canCombineCardWithFunnel({ data }: Dataset) {
  return (
    data?.cols?.length === 1 &&
    isNumeric(data.cols[0]) &&
    data.rows?.length === 1
  );
}

// Normally, findColumnSlotForFunnel returns a viz setting key that fits a given column
// There's no viz setting for scalar funnels, as we're adding a row value to the dataset,
// instead of adding a column, so we need to use a special name for that
const SCALAR_FUNNEL_SLOT = "scalar_funnel";

export function findColumnSlotForFunnel(parameters: {
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >;
  settings: ComputedVisualizationSettings;
  dataSourceColumns: DatasetColumn[];
  column: DatasetColumn;
}) {
  const { state, settings, dataSourceColumns, column } = parameters;
  const isEmpty = state.columns.length === 0;

  if (
    (isEmpty || isScalarFunnel(state)) &&
    dataSourceColumns.length === 1 &&
    isNumeric(dataSourceColumns[0])
  ) {
    return SCALAR_FUNNEL_SLOT;
  } else {
    const ownMetric = settings["funnel.metric"];
    if (!ownMetric && isMetric(column)) {
      return "funnel.metric";
    }

    const ownDimension = settings["funnel.dimension"];
    if (!ownDimension && isDimension(column) && !isMetric(column)) {
      return "funnel.dimension";
    }
  }
}

export function addScalarToFunnel(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  dataSource: VisualizerDataSource,
  column: DatasetColumn,
) {
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  let metricColumnName = settings["funnel.metric"];
  let dimensionColumnName = settings["funnel.dimension"];

  if (!metricColumnName) {
    metricColumnName = "METRIC";
    state.columns.push(createMetricColumn(metricColumnName, column.base_type));
    state.settings["funnel.metric"] = metricColumnName;
  }
  if (!dimensionColumnName) {
    dimensionColumnName = "DIMENSION";
    state.columns.push(createDimensionColumn(dimensionColumnName));
    state.settings["funnel.dimension"] = dimensionColumnName;
  }

  state.columnValuesMapping[metricColumnName] = addColumnMapping(
    state.columnValuesMapping[metricColumnName],
    columnRef,
  );
  state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
    state.columnValuesMapping[dimensionColumnName],
    createDataSourceNameRef(dataSource.id),
  );
}

export function addColumnToFunnel(
  state:
    | Draft<VisualizerVizDefinitionWithColumns>
    | VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  datasets: Record<string, Dataset>,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataset: Dataset,
  dataSource: VisualizerDataSource,
) {
  const slot = findColumnSlotForFunnel({
    state,
    settings,
    dataSourceColumns: dataset.data.cols,
    column,
  });

  if (!slot) {
    return;
  }

  if (slot === "scalar_funnel") {
    addScalarToFunnel(state, settings, dataSource, dataset.data.cols[0]);
    return;
  }

  state.columns.push(column);
  state.columnValuesMapping[column.name] = [columnRef];
  if (slot === "funnel.metric") {
    state.settings["funnel.metric"] = column.name;
  } else if (slot === "funnel.dimension") {
    state.settings["funnel.dimension"] = column.name;
  }
}

export function removeColumnFromFunnel(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  columnName: string,
) {
  if (isScalarFunnel(state)) {
    if (columnName === "METRIC" || columnName === "DIMENSION") {
      state.columns = [];
      state.columnValuesMapping = {};
      state.settings = _.pick(state.settings, "card.title");
    } else {
      const index = state.columnValuesMapping.METRIC.findIndex(
        (mapping) => typeof mapping !== "string" && mapping.name === columnName,
      );
      if (index >= 0) {
        state.columnValuesMapping.METRIC.splice(index, 1);
        state.columnValuesMapping.DIMENSION.splice(index, 1);
      }
    }
  } else {
    if (settings["funnel.metric"] === columnName) {
      delete state.settings["funnel.metric"];
    }
    if (settings["funnel.dimension"] === columnName) {
      delete state.settings["funnel.dimension"];
    }
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "funnel.metric",
    "funnel.dimension",
  ]);
}

export function createMetricColumn(
  name: string,
  type = "type/Integer",
): DatasetColumn {
  return {
    name,
    display_name: name,
    base_type: type,
    effective_type: type,
    field_ref: ["field", name, { "base-type": type }],
    source: "artificial",
  };
}

export function createDimensionColumn(name: string): DatasetColumn {
  return {
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    field_ref: ["field", name, { "base-type": "type/Text" }],
    source: "artificial",
  };
}

export function isScalarFunnel(
  state: Pick<VisualizerVizDefinitionWithColumns, "display" | "settings">,
) {
  return (
    state.display === "funnel" &&
    state.settings["funnel.metric"] === "METRIC" &&
    state.settings["funnel.dimension"] === "DIMENSION"
  );
}

export function combineWithFunnel(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  dataset: Dataset,
  dataSource: VisualizerDataSource,
) {
  const { data } = dataset;

  const isEmpty = !settings["funnel.metric"] && !settings["funnel.dimension"];
  const isMadeOfScalars = state.columnValuesMapping.METRIC?.length >= 1;

  if ((isEmpty || isMadeOfScalars) && canCombineCardWithFunnel(dataset)) {
    const [column] = data.cols;
    addScalarToFunnel(state, settings, dataSource, column);
    return state;
  }

  if (!isMadeOfScalars) {
    const metrics = data.cols.filter((col) => isMetric(col));
    const dimensions = data.cols.filter(
      (col) => isDimension(col) && !isMetric(col),
    );

    if (!settings["funnel.metric"] && metrics.length === 1) {
      const [metric] = metrics;
      const columnRef = createVisualizerColumnReference(
        dataSource,
        metric,
        extractReferencedColumns(state.columnValuesMapping),
      );
      const newColumn = copyColumn(
        columnRef.name,
        metric,
        dataSource.name,
        state.columns,
      );
      state.columns = [...state.columns, newColumn];
      state.columnValuesMapping = {
        ...state.columnValuesMapping,
        [newColumn.name]: [columnRef],
      };
      state.settings["funnel.metric"] = columnRef.name;
    }

    if (!settings["funnel.dimension"] && dimensions.length === 1) {
      const [dimension] = dimensions;
      const columnRef = createVisualizerColumnReference(
        dataSource,
        dimension,
        extractReferencedColumns(state.columnValuesMapping),
      );
      const newColumn = copyColumn(
        columnRef.name,
        dimension,
        dataSource.name,
        state.columns,
      );
      state.columns = [...state.columns, newColumn];
      state.columnValuesMapping = {
        ...state.columnValuesMapping,
        [newColumn.name]: [columnRef],
      };
      state.settings["funnel.dimension"] = columnRef.name;
    }
  }
}
