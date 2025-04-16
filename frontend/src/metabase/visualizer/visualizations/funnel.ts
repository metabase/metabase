import type { DragEndEvent } from "@dnd-kit/core";
import _ from "underscore";

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
import type { Dataset, DatasetColumn } from "metabase-types/api";
import type {
  VisualizerColumnReference,
  VisualizerDataSource,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

import { removeColumnFromStateUnlessUsedElseWhere } from "./utils";

export const funnelDropHandler = (
  state: VisualizerHistoryItem,
  { active, over }: DragEndEvent,
) => {
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
    addScalarToFunnel(state, dataSource, column);
  }

  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    let dimensionColumnName = state.settings["funnel.dimension"];
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

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL && isNumeric(column)) {
    let metricColumnName = state.settings["funnel.metric"];
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

export function addScalarToFunnel(
  state: VisualizerHistoryItem,
  dataSource: VisualizerDataSource,
  column: DatasetColumn,
) {
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    extractReferencedColumns(state.columnValuesMapping),
  );

  let metricColumnName = state.settings["funnel.metric"];
  let dimensionColumnName = state.settings["funnel.dimension"];

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
  state: VisualizerHistoryItem,
  column: DatasetColumn,
  columnRef: VisualizerColumnReference,
  dataset: Dataset,
  dataSource: VisualizerDataSource,
) {
  const isEmpty = state.columns.length === 0;

  if ((isEmpty || isScalarFunnel(state)) && canCombineCardWithFunnel(dataset)) {
    addScalarToFunnel(state, dataSource, dataset.data.cols[0]);
    return;
  }

  if (!isScalarFunnel(state)) {
    state.columns.push(column);
    state.columnValuesMapping[column.name] = [columnRef];

    const metric = state.settings["funnel.metric"];
    if (!metric && isMetric(column)) {
      state.settings["funnel.metric"] = column.name;
    }

    const dimension = state.settings["funnel.dimension"];
    if (!dimension && isDimension(column) && !isMetric(column)) {
      state.settings["funnel.dimension"] = column.name;
    }
  }
}

export function removeColumnFromFunnel(
  state: VisualizerHistoryItem,
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
    if (state.settings["funnel.metric"] === columnName) {
      delete state.settings["funnel.metric"];
    }
    if (state.settings["funnel.dimension"] === columnName) {
      delete state.settings["funnel.dimension"];
    }
  }

  removeColumnFromStateUnlessUsedElseWhere(state, columnName, [
    "funnel.metric",
    "funnel.dimension",
  ]);
}

function createMetricColumn(
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

function createDimensionColumn(name: string): DatasetColumn {
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
  state: Pick<VisualizerHistoryItem, "display" | "settings">,
) {
  return (
    state.display === "funnel" &&
    state.settings["funnel.metric"] === "METRIC" &&
    state.settings["funnel.dimension"] === "DIMENSION"
  );
}

export function combineWithFunnel(
  state: VisualizerHistoryItem,
  dataset: Dataset,
  dataSource: VisualizerDataSource,
) {
  const { data } = dataset;

  const isEmpty =
    !state.settings["funnel.metric"] && !state.settings["funnel.dimension"];
  const isMadeOfScalars = state.columnValuesMapping.METRIC?.length >= 1;

  if ((isEmpty || isMadeOfScalars) && canCombineCardWithFunnel(dataset)) {
    const [column] = data.cols;
    addScalarToFunnel(state, dataSource, column);
    return state;
  }

  if (!isMadeOfScalars) {
    const metrics = data.cols.filter((col) => isMetric(col));
    const dimensions = data.cols.filter(
      (col) => isDimension(col) && !isMetric(col),
    );

    if (!state.settings["funnel.metric"] && metrics.length === 1) {
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

    if (!state.settings["funnel.dimension"] && dimensions.length === 1) {
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
