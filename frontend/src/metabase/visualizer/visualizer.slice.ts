import type { DragEndEvent } from "@dnd-kit/core";
import { type PayloadAction, createSlice } from "@reduxjs/toolkit";
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
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerState,
} from "metabase-types/store/visualizer";

import { getReferencedColumns } from "./selectors";
import {
  addColumnMapping,
  createDataSource,
  createDataSourceNameRef,
  createDimensionColumn,
  createMetricColumn,
  createVisualizerColumnReference,
  getDataSourceIdFromNameRef,
} from "./utils";
import { cartesianDropHandler } from "./visualizations/cartesian";
import { funnelDropHandler } from "./visualizations/funnel";
import { pivotDropHandler } from "./visualizations/pivot";

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
