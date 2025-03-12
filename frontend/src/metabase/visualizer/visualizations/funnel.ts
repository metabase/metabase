import type { DragEndEvent } from "@dnd-kit/core";

import { DROPPABLE_ID } from "metabase/visualizer/constants";
import {
  addColumnMapping,
  copyColumn,
  createDataSourceNameRef,
  createVisualizerColumnReference,
  extractReferencedColumns,
  isDraggedColumnItem,
} from "metabase/visualizer/utils";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card, Dataset, DatasetColumn } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerHistoryItem,
} from "metabase-types/store/visualizer";

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
        col => col.name === dimensionColumnName,
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
        col => col.name === metricColumnName,
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

export function canCombineCardWithFunnel(card: Card, dataset: Dataset) {
  return (
    card.display === "scalar" &&
    dataset.data?.cols?.length === 1 &&
    isNumeric(dataset.data.cols[0]) &&
    dataset.data.rows?.length === 1
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

export function removeColumnFromFunnel(
  state: VisualizerHistoryItem,
  columnName: string,
) {
  const isMadeOfScalars = state.columnValuesMapping.METRIC?.length >= 1;

  if (isMadeOfScalars) {
    if (columnName === "METRIC") {
      state.columns = [];
      state.columnValuesMapping = {};
      state.settings = {};
      return;
    }

    const index = state.columnValuesMapping.METRIC.findIndex(
      mapping => typeof mapping !== "string" && mapping.name === columnName,
    );
    if (index >= 0) {
      state.columnValuesMapping.METRIC.splice(index, 1);
      state.columnValuesMapping.DIMENSION.splice(index, 1);
    }
  } else {
    if (state.settings["funnel.metric"] === columnName) {
      delete state.settings["funnel.metric"];
    }
    if (state.settings["funnel.dimension"] === columnName) {
      delete state.settings["funnel.dimension"];
    }
  }
}
