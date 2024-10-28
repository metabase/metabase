import {
  type PayloadAction,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { isNotFalsy } from "metabase/lib/types";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  RawSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  DraggedItem,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerState,
} from "metabase-types/store/visualizer";

import { createDataSource } from "./utils";

const initialState: VisualizerState = {
  display: null,
  mappings: [],
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
    setDisplay: (state, action: PayloadAction<VisualizationDisplay | null>) => {
      state.display = action.payload;
      state.settings = {};
      state.mappings = [];
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
        state.datasets[`card:${cardId}`] = action.payload;
        state.loadingDatasets[`card:${cardId}`] = false;
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
  setDisplay,
  updateSettings,
  removeDataSource,
  toggleDataSourceExpanded,
  setDraggedItem,
} = visualizerSlice.actions;

export const { reducer } = visualizerSlice;

export const getSettings = (state: { visualizer: VisualizerState }) =>
  state.visualizer.settings;

export const getVisualizationType = (state: { visualizer: VisualizerState }) =>
  state.visualizer.display;

export const getDatasets = (state: { visualizer: VisualizerState }) =>
  state.visualizer.datasets;

export const getExpandedDataSources = (state: {
  visualizer: VisualizerState;
}) => state.visualizer.expandedDataSources;

export const getDraggedItem = (state: { visualizer: VisualizerState }) =>
  state.visualizer.draggedItem;

// Must remain private
const getCards = (state: { visualizer: VisualizerState }) =>
  state.visualizer.cards;

const getVizDataSourceMappings = (state: { visualizer: VisualizerState }) =>
  state.visualizer.mappings;

export const getDataSources = createSelector([getCards], cards =>
  cards.map(card => createDataSource("card", card.id, card.name)),
);

export const getVisualizerRawSeries = createSelector(
  [
    getVisualizationType,
    getVizDataSourceMappings,
    getSettings,
    getDataSources,
    getDatasets,
  ],
  (display, mappings, settings, dataSources, datasets): RawSeries => {
    if (!display) {
      return [];
    }

    const metricColumn: DatasetColumn = {
      base_type: "type/Integer",
      effective_type: "type/Integer",
      display_name: "METRIC",
      field_ref: ["field", "METRIC", { "base-type": "type/Integer" }],
      name: "METRIC",
      source: "artificial",
    };

    const dimensionColumn: DatasetColumn = {
      base_type: "type/Text",
      effective_type: "type/Text",
      display_name: "DIMENSION",
      field_ref: ["field", "DIMENSION", { "base-type": "type/Text" }],
      name: "DIMENSION",
      source: "artificial",
    };

    const rows = mappings
      .map(mapping => {
        const source = dataSources.find(ds => ds.id === mapping.sourceId);
        const dataset = datasets[mapping.sourceId];
        if (!source || !dataset) {
          return;
        }
        const metricColumnIndex = dataset.data.cols.findIndex(
          col => col.name === mapping.settings["funnel.metric"],
        );
        const value = dataset.data.rows[0][metricColumnIndex];
        if (!value) {
          return;
        }
        return [source.name, value];
      })
      .filter(isNotFalsy);

    return [
      {
        card: {
          display,
          visualization_settings: settings,
        },
        data: {
          cols: [dimensionColumn, metricColumn],
          rows: rows,
          results_metadata: {
            columns: [dimensionColumn, metricColumn],
          },
        },
      },
    ];
  },
);

export const getVisualizerComputedSettings = createSelector(
  [getVisualizerRawSeries],
  rawSeries =>
    rawSeries.length > 0 ? getComputedSettingsForSeries(rawSeries) : {},
);
