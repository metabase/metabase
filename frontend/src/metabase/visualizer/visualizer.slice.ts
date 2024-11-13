import type { DragEndEvent } from "@dnd-kit/core";
import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { isCartesianChart } from "metabase/visualizations";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  DraggedItem,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerState,
} from "metabase-types/store/visualizer";

import { DROPPABLE_ID } from "./constants";
import { getReferencedColumns } from "./selectors";
import {
  checkColumnMappingExists,
  createDataSource,
  createDataSourceNameRef,
  createDimensionColumn,
  createMetricColumn,
  createVisualizerColumnReference,
  getDataSourceIdFromNameRef,
  isDraggedColumnItem,
  isDraggedWellItem,
} from "./utils";

const initialState: VisualizerState = {
  display: null,
  columns: [],
  columnValuesMapping: {},
  settings: {},
  cards: [],
  datasets: {},
  loadingDataSources: {},
  loadingDatasets: {},
  expandedDataSources: {},
  error: null,
  draggedItem: null,
};

export const addDataSource = createAsyncThunk(
  "visualizer/dataImporter/addDataSource",
  async (source: VisualizerDataSource, { dispatch }) => {
    if (source.type === "card") {
      const cardId = source.sourceId;
      await dispatch(fetchCard(cardId));
      await dispatch(fetchCardQuery(cardId));
    } else {
      console.warn(`Unsupported data source type: ${source.type}`);
    }
  },
);

const fetchCard = createAsyncThunk<Card, CardId>(
  "visualizer/fetchCard",
  async (cardId, { dispatch }) => {
    const result = await dispatch(
      cardApi.endpoints.getCard.initiate({ id: cardId }),
    );
    if (result.data != null) {
      return result.data;
    }
    throw new Error("Failed to fetch card");
  },
);

const fetchCardQuery = createAsyncThunk<Dataset, CardId>(
  "visualizer/fetchCardQuery",
  async (cardId, { dispatch }) => {
    const result = await dispatch(
      cardApi.endpoints.getCardQuery.initiate({ cardId, parameters: [] }),
    );
    if (result.data != null) {
      return result.data;
    }
    throw new Error("Failed to fetch card query");
  },
);

const visualizerSlice = createSlice({
  name: "visualizer",
  initialState,
  reducers: {
    handleDrop: (state, action: PayloadAction<DragEndEvent>) => {
      state.draggedItem = null;

      if (!state.display) {
        return;
      }

      const event = action.payload;

      if (isCartesianChart(state.display)) {
        cartesianDropHandler(state, event);
      } else if (state.display === "funnel") {
        funnelDropHandler(state, event);
      } else if (state.display === "pivot") {
        pivotDropHandler(state, event);
      }
    },
    setDisplay: (state, action: PayloadAction<VisualizationDisplay | null>) => {
      const display = action.payload;

      if (
        display &&
        state.display &&
        isCartesianChart(display) &&
        isCartesianChart(state.display)
      ) {
        state.display = display;
        return;
      }

      state.display = display;
      state.settings = {};
      state.columns = [];
      state.columnValuesMapping = {};

      if (!display) {
        return;
      }

      if (isCartesianChart(display) || display === "funnel") {
        const metric = createMetricColumn();
        const dimension = createDimensionColumn();

        state.columns = [metric, dimension];

        if (display === "scatter") {
          state.columns.push(createMetricColumn({ name: "BUBBLE_SIZE" }));
        }

        if (display === "funnel") {
          state.settings = {
            "funnel.metric": metric.name,
            "funnel.dimension": dimension.name,
          };
        } else {
          state.settings = {
            "graph.metrics": [metric.name],
            "graph.dimensions": [dimension.name],
          };

          if (display === "scatter") {
            state.settings["scatter.bubble"] = "BUBBLE_SIZE";
          }
        }
      }

      if (display === "pivot") {
        state.columns = [
          {
            name: "pivot-grouping",
            display_name: "pivot-grouping",
            expression_name: "pivot-grouping",
            field_ref: ["expression", "pivot-grouping"],
            base_type: "type/Integer",
            effective_type: "type/Integer",
            source: "artificial",
          },
        ];
      }
    },
    updateSettings: (state, action: PayloadAction<VisualizationSettings>) => {
      state.settings = {
        ...state.settings,
        ...action.payload,
      };
    },
    removeDataSource: (state, action: PayloadAction<VisualizerDataSource>) => {
      const source = action.payload;
      if (source.type === "card") {
        const cardId = source.sourceId;
        state.cards = state.cards.filter(card => card.id !== cardId);
      }
      delete state.expandedDataSources[source.id];
      delete state.loadingDataSources[source.id];
      delete state.datasets[source.id];
      delete state.loadingDatasets[source.id];

      state.columnValuesMapping = _.mapObject(
        state.columnValuesMapping,
        valueSources =>
          valueSources.filter(valueSource => {
            if (typeof valueSource === "string") {
              const dataSourceId = getDataSourceIdFromNameRef(valueSource);
              return dataSourceId !== source.id;
            }
            return valueSource.sourceId !== source.id;
          }),
      );
    },
    toggleDataSourceExpanded: (
      state,
      action: PayloadAction<VisualizerDataSourceId>,
    ) => {
      state.expandedDataSources[action.payload] =
        !state.expandedDataSources[action.payload];
    },
    setDraggedItem: (state, action: PayloadAction<DraggedItem | null>) => {
      state.draggedItem = action.payload;
    },
    resetVisualizer: () => initialState,
  },
  extraReducers: builder => {
    builder
      .addCase(fetchCard.pending, (state, action) => {
        const cardId = action.meta.arg;
        state.loadingDataSources[`card:${cardId}`] = true;
        state.error = null;
      })
      .addCase(fetchCard.fulfilled, (state, action) => {
        const card = action.payload;
        const index = state.cards.findIndex(c => c.id === card.id);
        if (index !== -1) {
          state.cards[index] = card;
        } else {
          state.cards.push(card);
        }
        state.loadingDatasets[`card:${card.id}`] = false;
        state.expandedDataSources[`card:${card.id}`] = true;
        if (!state.display) {
          state.display = card.display;
          state.settings = card.visualization_settings;
        }
      })
      .addCase(fetchCard.rejected, (state, action) => {
        const cardId = action.meta.arg;
        if (cardId) {
          state.loadingDataSources[`card:${cardId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card";
      })
      .addCase(fetchCardQuery.pending, (state, action) => {
        const cardId = action.meta.arg;
        state.loadingDatasets[`card:${cardId}`] = true;
        state.error = null;
      })
      .addCase(fetchCardQuery.fulfilled, (state, action) => {
        const cardId = action.meta.arg;
        const dataset = action.payload;
        state.datasets[`card:${cardId}`] = dataset;
        state.loadingDatasets[`card:${cardId}`] = false;

        const card = state.cards.find(card => card.id === cardId);

        if (state.display === "funnel") {
          if (
            card?.display === "scalar" &&
            dataset.data?.cols?.length === 1 &&
            isNumeric(dataset.data.cols[0]) &&
            dataset.data.rows?.length === 1
          ) {
            const dataSource = createDataSource("card", cardId, card.name);

            const columnRef = createVisualizerColumnReference(
              dataSource,
              dataset.data.cols[0],
              getReferencedColumns({ visualizer: state }),
            );

            const metricColumnName = state.settings["funnel.metric"];
            const dimensionColumnName = state.settings["funnel.dimension"];

            if (metricColumnName && dimensionColumnName) {
              state.columnValuesMapping[metricColumnName] = addColumnMapping(
                state.columnValuesMapping[metricColumnName],
                columnRef,
              );
              state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
                state.columnValuesMapping[dimensionColumnName],
                createDataSourceNameRef(dataSource.id),
              );
            }
          }
        }
      })
      .addCase(fetchCardQuery.rejected, (state, action) => {
        const cardId = action.meta.arg;
        if (cardId) {
          state.loadingDatasets[`card:${cardId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card query";
      });
  },
});

export const {
  handleDrop,
  setDisplay,
  updateSettings,
  removeDataSource,
  toggleDataSourceExpanded,
  setDraggedItem,
  resetVisualizer,
} = visualizerSlice.actions;

export const { reducer } = visualizerSlice;

type DropHandler = (state: VisualizerState, event: DragEndEvent) => void;

const cartesianDropHandler: DropHandler = (state, { active, over }) => {
  if (!over) {
    return;
  }

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isDraggedWellItem(active)) {
    const { wellId, column } = active.data.current;

    if (wellId === DROPPABLE_ID.X_AXIS_WELL) {
      const dimensions = state.settings["graph.dimensions"] ?? [];
      const nextDimensions = dimensions.filter(
        dimension => dimension !== column.name,
      );

      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];

      if (nextDimensions.length === 0) {
        const newDimension = createDimensionColumn();
        state.columns.push(newDimension);
        nextDimensions.push(newDimension.name);
      }

      state.settings = {
        ...state.settings,
        "graph.dimensions": nextDimensions,
      };
    }

    if (wellId === DROPPABLE_ID.Y_AXIS_WELL) {
      const metrics = state.settings["graph.metrics"] ?? [];
      const nextMetrics = metrics.filter(metric => metric !== column.name);

      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];

      if (nextMetrics.length === 0) {
        const newMetric = createMetricColumn();
        state.columns.push(newMetric);
        nextMetrics.push(newMetric.name);
      }

      state.settings = {
        ...state.settings,
        "graph.metrics": nextMetrics,
      };
    }
  }

  if (!isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;

  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    getReferencedColumns({ visualizer: state }),
  );

  if (over.id === DROPPABLE_ID.X_AXIS_WELL) {
    const dimensions = state.settings["graph.dimensions"] ?? [];

    const isInUse = Object.values(state.columnValuesMapping).some(
      valueSources => checkColumnMappingExists(valueSources, columnRef),
    );
    if (isInUse) {
      return;
    }

    const index = state.columns.findIndex(col => col.name === dimensions[0]);
    const dimension = state.columns[index];
    const isDimensionMappedToValues =
      state.columnValuesMapping[dimension.name]?.length > 0;

    if (dimensions.length === 1 && dimension && !isDimensionMappedToValues) {
      state.columns[index] = cloneColumnProperties(dimension, column);
      state.columnValuesMapping[dimension.name] = addColumnMapping(
        state.columnValuesMapping[dimension.name],
        columnRef,
      );
    } else {
      const nameIndex = dimensions.length + 1;
      const newDimension = cloneColumnProperties(
        createDimensionColumn({ name: `DIMENSION_${nameIndex}` }),
        column,
      );
      state.columns.push(newDimension);
      state.columnValuesMapping[newDimension.name] = [columnRef];
      state.settings = {
        ...state.settings,
        "graph.dimensions": [...dimensions, newDimension.name],
      };
    }
  }

  if (over.id === DROPPABLE_ID.Y_AXIS_WELL) {
    const metrics = state.settings["graph.metrics"] ?? [];

    const isInUse = Object.values(state.columnValuesMapping).some(
      valueSources => checkColumnMappingExists(valueSources, columnRef),
    );
    if (isInUse) {
      return;
    }

    const index = state.columns.findIndex(col => col.name === metrics[0]);
    const metric = state.columns[index];
    const isMetricMappedToValues =
      state.columnValuesMapping[metric.name]?.length > 0;

    if (metrics.length === 1 && metric && !isMetricMappedToValues) {
      state.columns[index] = cloneColumnProperties(metric, column);
      state.columnValuesMapping[metric.name] = addColumnMapping(
        state.columnValuesMapping[metric.name],
        columnRef,
      );
    } else {
      const nameIndex = metrics.length + 1;
      const newMetric = cloneColumnProperties(
        createMetricColumn({ name: `METRIC_${nameIndex}` }),
        column,
      );
      state.columns.push(newMetric);
      state.columnValuesMapping[newMetric.name] = [columnRef];
      state.settings = {
        ...state.settings,
        "graph.metrics": [...metrics, newMetric.name],
      };
    }
  }

  if (over.id === DROPPABLE_ID.SCATTER_BUBBLE_SIZE_WELL) {
    state.columnValuesMapping["BUBBLE_SIZE"] = [columnRef];
  }
};

const funnelDropHandler: DropHandler = (state, { active, over }) => {
  if (!over || !isDraggedColumnItem(active)) {
    return;
  }

  const { column, dataSource } = active.data.current;
  const columnRef = createVisualizerColumnReference(
    dataSource,
    column,
    getReferencedColumns({ visualizer: state }),
  );

  if (over.id === DROPPABLE_ID.CANVAS_MAIN && isNumeric(column)) {
    const metricColumnName = state.settings["funnel.metric"];
    const dimensionColumnName = state.settings["funnel.dimension"];
    if (metricColumnName && dimensionColumnName) {
      state.columnValuesMapping[metricColumnName] = addColumnMapping(
        state.columnValuesMapping[metricColumnName],
        columnRef,
      );
      state.columnValuesMapping[dimensionColumnName] = addColumnMapping(
        state.columnValuesMapping[dimensionColumnName],
        createDataSourceNameRef(dataSource.id),
      );
    }
  }
};

const pivotDropHandler: DropHandler = (state, { active, over }) => {
  if (over && isDraggedColumnItem(active)) {
    let shouldAddColumn = false;

    const { column, dataSource } = active.data.current;
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      getReferencedColumns({ visualizer: state }),
    );

    if (over.id === DROPPABLE_ID.PIVOT_COLUMNS_WELL) {
      const columns = state.settings["pivot_table.column_split"]?.columns ?? [];
      if (!columns.includes(columnRef.name)) {
        state.settings = {
          ...state.settings,
          "pivot_table.column_split": {
            ...(state.settings["pivot_table.column_split"] ?? {
              rows: [],
              values: [],
            }),
            columns: [...columns, columnRef.name],
          },
        };
        shouldAddColumn = true;
      }
    } else if (over.id === DROPPABLE_ID.PIVOT_ROWS_WELL) {
      const rows = state.settings["pivot_table.column_split"]?.rows ?? [];
      if (!rows.includes(columnRef.name)) {
        state.settings = {
          ...state.settings,
          "pivot_table.column_split": {
            ...(state.settings["pivot_table.column_split"] ?? {
              columns: [],
              values: [],
            }),
            rows: [...rows, columnRef.name],
          },
        };
        shouldAddColumn = true;
      }
    } else if (over.id === DROPPABLE_ID.PIVOT_VALUES_WELL) {
      const values = state.settings["pivot_table.column_split"]?.values ?? [];
      if (!values.includes(columnRef.name)) {
        state.settings = {
          ...state.settings,
          "pivot_table.column_split": {
            ...(state.settings["pivot_table.column_split"] ?? {
              columns: [],
              rows: [],
            }),
            values: [...values, columnRef.name],
          },
        };
        shouldAddColumn = true;
      }
    }

    if (shouldAddColumn) {
      state.columns.push({
        ...column,
        name: columnRef.name,
        source: column.source === "breakout" ? "breakout" : "artificial",
      });
      state.columnValuesMapping[columnRef.name] = [columnRef];
    }
  }

  if (
    isDraggedWellItem(active) &&
    (!over || over.id === DROPPABLE_ID.CANVAS_MAIN)
  ) {
    const { column, wellId } = active.data.current;

    if (wellId === DROPPABLE_ID.PIVOT_COLUMNS_WELL) {
      const columns = state.settings["pivot_table.column_split"]?.columns ?? [];
      state.settings = {
        ...state.settings,
        "pivot_table.column_split": {
          ...(state.settings["pivot_table.column_split"] ?? {
            rows: [],
            values: [],
          }),
          columns: columns.filter(col => col !== column.name),
        },
      };
      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];
    } else if (wellId === DROPPABLE_ID.PIVOT_ROWS_WELL) {
      const rows = state.settings["pivot_table.column_split"]?.rows ?? [];
      state.settings = {
        ...state.settings,
        "pivot_table.column_split": {
          ...(state.settings["pivot_table.column_split"] ?? {
            columns: [],
            values: [],
          }),
          rows: rows.filter(col => col !== column.name),
        },
      };
      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];
    } else if (wellId === DROPPABLE_ID.PIVOT_VALUES_WELL) {
      const values = state.settings["pivot_table.column_split"]?.values ?? [];
      state.settings = {
        ...state.settings,
        "pivot_table.column_split": {
          ...(state.settings["pivot_table.column_split"] ?? {
            columns: [],
            rows: [],
          }),
          values: values.filter(col => col !== column.name),
        },
      };
      state.columns = state.columns.filter(col => col.name !== column.name);
      delete state.columnValuesMapping[column.name];
    }
  }
};

function addColumnMapping(
  mapping: VisualizerColumnValueSource[] | undefined,
  source: VisualizerColumnValueSource,
) {
  const nextMapping = mapping ? [...mapping] : [];
  if (!checkColumnMappingExists(nextMapping, source)) {
    nextMapping.push(source);
  }
  return nextMapping;
}

function cloneColumnProperties(
  visualizerColumn: DatasetColumn,
  column: DatasetColumn,
) {
  const nextColumn = {
    ...visualizerColumn,
    base_type: column.base_type,
    effective_type: column.effective_type,
    display_name: column.display_name,
  };

  // TODO Remove manual MBQL manipulation
  if (isDate(column)) {
    const opts = { "base-type": column.base_type };
    const temporalUnit = maybeGetTemporalUnit(column);
    if (temporalUnit) {
      opts["temporal-unit"] = temporalUnit;
    }
    nextColumn.field_ref = [
      visualizerColumn?.field_ref?.[0] ?? "field",
      visualizerColumn?.field_ref?.[1] ?? nextColumn.name,
      opts,
    ];
  }

  return nextColumn;
}

function maybeGetTemporalUnit(col: DatasetColumn) {
  const maybeOpts = col.field_ref?.[2];
  if (maybeOpts && "temporal-unit" in maybeOpts) {
    return maybeOpts["temporal-unit"];
  }
}
