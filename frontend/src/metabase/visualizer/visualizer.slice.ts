import type { DragEndEvent } from "@dnd-kit/core";
import {
  type Action,
  type PayloadAction,
  createAction,
  createSlice,
} from "@reduxjs/toolkit";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { isCartesianChart } from "metabase/visualizations";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  CardId,
  Dataset,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  DraggedItem,
  VisualizerCommonState,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerHistoryItem,
  VisualizerState,
} from "metabase-types/store/visualizer";

import {
  addColumnMapping,
  createDataSource,
  createDataSourceNameRef,
  createDimensionColumn,
  createMetricColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
  getDataSourceIdFromNameRef,
} from "./utils";
import { cartesianDropHandler } from "./visualizations/cartesian";
import { funnelDropHandler } from "./visualizations/funnel";
import { pieDropHandler } from "./visualizations/pie";
import { pivotDropHandler } from "./visualizations/pivot";

const initialCommonState: VisualizerCommonState = {
  cards: [],
  datasets: {},
  loadingDataSources: {},
  loadingDatasets: {},
  expandedDataSources: {},
  error: null,
  draggedItem: null,
};

const initialVisualizerHistoryItem: VisualizerHistoryItem = {
  display: null,
  columns: [],
  columnValuesMapping: {},
  settings: {},
};

const initialState: VisualizerState = {
  ...initialCommonState,
  past: [],
  present: initialVisualizerHistoryItem,
  future: [],
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

export const removeDataSource = createAction<VisualizerDataSource>(
  "metabase/visualizer/removeDataSource",
);

export const handleDrop = createAction<DragEndEvent>(
  "metabase/visualizer/handleDrop",
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

const fetchCardQuery = createAsyncThunk<
  { card?: Card; dataset: Dataset },
  CardId
>("visualizer/fetchCardQuery", async (cardId, { dispatch, getState }) => {
  const result = await dispatch(
    cardApi.endpoints.getCardQuery.initiate({ cardId, parameters: [] }),
  );
  if (result.data != null) {
    return {
      dataset: result.data,
      card: getState().visualizer.cards.find(card => card.id === cardId),
    };
  }
  throw new Error("Failed to fetch card query");
});

const visualizerHistoryItemSlice = createSlice({
  name: "present",
  initialState: initialVisualizerHistoryItem,
  reducers: {
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

      if (display === "pie") {
        const metric = createMetricColumn();
        const dimension = createDimensionColumn();
        state.columns = [metric, dimension];
        state.settings = {
          "pie.metric": metric.name,
          "pie.dimension": [dimension.name],
        };
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
  },
  extraReducers: builder => {
    builder
      .addCase(handleDrop, (state, action) => {
        if (!state.display) {
          return;
        }

        const event = action.payload;

        if (isCartesianChart(state.display)) {
          cartesianDropHandler(state, event);
        } else if (state.display === "funnel") {
          funnelDropHandler(state, event);
        } else if (state.display === "pie") {
          pieDropHandler(state, event);
        } else if (state.display === "pivot") {
          pivotDropHandler(state, event);
        }
      })
      .addCase(removeDataSource, (state, action) => {
        const source = action.payload;
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
      })
      .addCase(fetchCard.fulfilled, (state, action) => {
        const card = action.payload;
        if (!state.display) {
          state.display = card.display;
          state.settings = card.visualization_settings;
        }
      })
      .addCase(fetchCardQuery.fulfilled, (state, action) => {
        const { card, dataset } = action.payload;

        if (state.display === "funnel") {
          if (
            card?.display === "scalar" &&
            dataset.data?.cols?.length === 1 &&
            isNumeric(dataset.data.cols[0]) &&
            dataset.data.rows?.length === 1
          ) {
            const dataSource = createDataSource("card", card.id, card.name);

            const columnRef = createVisualizerColumnReference(
              dataSource,
              dataset.data.cols[0],
              extractReferencedColumns(state.columnValuesMapping),
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
      });
  },
});

const visualizerSlice = createSlice({
  name: "visualizer",
  initialState,
  reducers: {
    setDraggedItem: (state, action: PayloadAction<DraggedItem | null>) => {
      state.draggedItem = action.payload;
    },
    toggleDataSourceExpanded: (
      state,
      action: PayloadAction<VisualizerDataSourceId>,
    ) => {
      state.expandedDataSources[action.payload] =
        !state.expandedDataSources[action.payload];
    },
    undo: state => {
      const canUndo = state.past.length > 0;
      if (canUndo) {
        state.future = [state.present, ...state.future];
        state.present = state.past[state.past.length - 1];
        state.past = state.past.slice(0, state.past.length - 1);
      }
    },
    redo: state => {
      const canRedo = state.future.length > 0;
      if (canRedo) {
        state.past = [...state.past, state.present];
        state.present = state.future[0];
        state.future = state.future.slice(1);
      }
    },
    resetVisualizer: () => initialState,
  },
  extraReducers: builder => {
    builder
      .addCase(handleDrop, (state, action) => {
        state.draggedItem = null;
        maybeUpdateHistory(state, action);
      })
      .addCase(removeDataSource, (state, action) => {
        const source = action.payload;
        if (source.type === "card") {
          const cardId = source.sourceId;
          state.cards = state.cards.filter(card => card.id !== cardId);
        }
        delete state.expandedDataSources[source.id];
        delete state.loadingDataSources[source.id];
        delete state.datasets[source.id];
        delete state.loadingDatasets[source.id];
        maybeUpdateHistory(state, action);
      })
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
        maybeUpdateHistory(state, action);
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
        const { dataset } = action.payload;
        state.datasets[`card:${cardId}`] = dataset;
        state.loadingDatasets[`card:${cardId}`] = false;
        maybeUpdateHistory(state, action);
      })
      .addCase(fetchCardQuery.rejected, (state, action) => {
        const cardId = action.meta.arg;
        if (cardId) {
          state.loadingDatasets[`card:${cardId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card query";
      })
      .addDefaultCase((state, action) => {
        maybeUpdateHistory(state, action);
      });
  },
});

function maybeUpdateHistory(state: VisualizerState, action: Action) {
  const present = _.clone(state.present);
  const newPresent = visualizerHistoryItemSlice.reducer(state.present, action);
  if (!_.isEqual(present, newPresent)) {
    state.past = [...state.past, present];
    state.present = newPresent;
    state.future = [];
  }
}

export const { setDisplay, updateSettings } =
  visualizerHistoryItemSlice.actions;

export const {
  setDraggedItem,
  toggleDataSourceExpanded,
  undo,
  redo,
  resetVisualizer,
} = visualizerSlice.actions;

export const { reducer } = visualizerSlice;
