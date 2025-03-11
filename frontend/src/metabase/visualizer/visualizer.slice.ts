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
import { copy } from "metabase/lib/utils";
import {
  getColumnVizSettings,
  isCartesianChart,
} from "metabase/visualizations";
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
  VisualizerCommonState,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerHistoryItem,
  VisualizerState,
} from "metabase-types/store/visualizer";

import { getVisualizerComputedSettings } from "./selectors";
import {
  canCombineCard,
  copyColumn,
  createDataSource,
  createVisualizerColumnReference,
  extractReferencedColumns,
  getDataSourceIdFromNameRef,
  getDefaultVisualizationName,
  getInitialStateForCardDataSource,
  parseDataSourceId,
} from "./utils";
import { getUpdatedSettingsForDisplay } from "./utils/get-updated-settings-for-display";
import {
  addDimensionColumnToCartesianChart,
  addMetricColumnToCartesianChart,
  cartesianDropHandler,
  removeColumnFromCartesianChart,
} from "./visualizations/cartesian";
import {
  addScalarToFunnel,
  canCombineCardWithFunnel,
  funnelDropHandler,
  removeColumnFromFunnel,
} from "./visualizations/funnel";
import { mapDropHandler, removeColumnFromMap } from "./visualizations/map";
import { pieDropHandler, removeColumnFromPieChart } from "./visualizations/pie";

const initialCommonState: VisualizerCommonState = {
  cards: [],
  datasets: {},
  loadingDataSources: {},
  loadingDatasets: {},
  expandedDataSources: {},
  isFullscreen: false,
  isVizSettingsSidebarOpen: false,
  error: null,
  draggedItem: null,
};

function getInitialVisualizerHistoryItem(): VisualizerHistoryItem {
  return {
    display: null,
    columns: [],
    columnValuesMapping: {},
    settings: {
      "card.title": getDefaultVisualizationName(),
    },
  };
}

function getInitialState(): VisualizerState {
  return {
    ...initialCommonState,
    past: [],
    present: getInitialVisualizerHistoryItem(),
    future: [],
    initialState: getInitialVisualizerHistoryItem(),
  };
}

type InitVisualizerPayload = {
  state?: Partial<VisualizerHistoryItem>;
  extraDataSources?: VisualizerDataSourceId[];
};

export const initializeVisualizer = createAsyncThunk(
  "visualizer/initializeVisualizer",
  async (
    { state: initialState = {}, extraDataSources = [] }: InitVisualizerPayload,
    { dispatch },
  ) => {
    const columnRefs = initialState.columnValuesMapping
      ? extractReferencedColumns(initialState.columnValuesMapping)
      : [];
    const dataSourceIds = Array.from(
      new Set(columnRefs.map(ref => ref.sourceId)),
    );
    if (extraDataSources.length > 0) {
      dataSourceIds.push(...extraDataSources);
    }
    await Promise.all(
      dataSourceIds
        .map(sourceId => {
          const [, cardId] = sourceId.split(":");
          return [
            dispatch(fetchCard(Number(cardId))),
            dispatch(fetchCardQuery(Number(cardId))),
          ];
        })
        .flat(),
    );
    return copy(initialState);
  },
);

export const addDataSource = createAsyncThunk<
  { card: Card; dataset: Dataset },
  VisualizerDataSourceId
>("visualizer/dataImporter/addDataSource", async (id, { dispatch }) => {
  const { type, sourceId } = parseDataSourceId(id);
  if (type === "card") {
    const cardAction = await dispatch(fetchCard(sourceId));
    const cardQueryAction = await dispatch(fetchCardQuery(sourceId));

    // TODO handle rejected requests
    return {
      card: cardAction.payload as Card,
      dataset: cardQueryAction.payload as Dataset,
    };
  }
  throw new Error(`Unsupported data source type: ${type}`);
});

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

export const setDisplay = createAsyncThunk(
  "visualizer/setDisplay",
  (display: VisualizationDisplay | null, { getState }) => {
    const computedSettings = getVisualizerComputedSettings(getState());
    return { display, computedSettings };
  },
);

const visualizerHistoryItemSlice = createSlice({
  name: "present",
  initialState: getInitialVisualizerHistoryItem(),
  reducers: {
    setTitle: (state, action: PayloadAction<string>) => {
      if (!state.settings) {
        state.settings = {};
      }
      state.settings["card.title"] = action.payload;
    },
    updateSettings: (state, action: PayloadAction<VisualizationSettings>) => {
      state.settings = {
        ...state.settings,
        ...action.payload,
      };
    },
    addColumn: (
      state,
      action: PayloadAction<{
        dataSource: VisualizerDataSource;
        column: DatasetColumn;
      }>,
    ) => {
      const { dataSource, column } = action.payload;

      if (!state.display) {
        return;
      }

      const columnRef = createVisualizerColumnReference(
        dataSource,
        column,
        extractReferencedColumns(state.columnValuesMapping),
      );

      const newColumn = copyColumn(
        columnRef.name,
        column,
        dataSource.name,
        state.columns,
      );
      state.columns.push(newColumn);
      state.columnValuesMapping[newColumn.name] = [columnRef];
    },
    removeColumn: (state, action: PayloadAction<{ name: string }>) => {
      const { name } = action.payload;
      if (!state.display) {
        return;
      }

      state.columns = state.columns.filter(col => col.name !== name);
      delete state.columnValuesMapping[name];

      if (isCartesianChart(state.display)) {
        removeColumnFromCartesianChart(state, name);
      } else if (state.display === "funnel") {
        removeColumnFromFunnel(state, name);
      } else if (state.display === "pie") {
        removeColumnFromPieChart(state, name);
      } else if (state.display === "map") {
        removeColumnFromMap(state, name);
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(setDisplay.fulfilled, (state, action) => {
        const { display, computedSettings } = action.payload;
        const { columnValuesMapping, columns, settings } =
          getUpdatedSettingsForDisplay(
            state.columnValuesMapping,
            state.columns,
            computedSettings,
            state.display,
            display,
          );

        state.columnValuesMapping = columnValuesMapping;
        state.columns = columns;
        state.settings = settings;
        state.display = display;
      })
      .addCase(initializeVisualizer.fulfilled, (state, action) => {
        const initialState = action.payload;
        if (initialState) {
          Object.assign(state, initialState);
        }
        if (!state.settings?.["card.title"]) {
          state.settings["card.title"] = getDefaultVisualizationName();
        }
      })
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
        } else if (state.display === "map") {
          mapDropHandler(state, event);
        }
      })
      .addCase(addDataSource.fulfilled, (state, action) => {
        const { card, dataset } = action.payload;
        Object.assign(state, maybeCombineDataset(state, card, dataset));
      })
      .addCase(removeDataSource, (state, action) => {
        const source = action.payload;

        const columnsToRemove: string[] = [];
        const columnVizSettings = state.display
          ? getColumnVizSettings(state.display)
          : [];

        state.columnValuesMapping = _.mapObject(
          state.columnValuesMapping,
          (valueSources, columnName) => {
            const nextValueSources = valueSources.filter(valueSource => {
              if (typeof valueSource === "string") {
                const dataSourceId = getDataSourceIdFromNameRef(valueSource);
                return dataSourceId !== source.id;
              }
              return valueSource.sourceId !== source.id;
            });
            if (nextValueSources.length === 0) {
              columnsToRemove.push(columnName);
            }
            return nextValueSources;
          },
        );

        state.columns = state.columns.filter(
          column => !columnsToRemove.includes(column.name),
        );
        columnsToRemove.forEach(columName => {
          delete state.columnValuesMapping[columName];
        });
        columnVizSettings.forEach(setting => {
          const value = state.settings[setting];
          if (columnsToRemove.includes(value)) {
            delete state.settings[setting];
          } else if (Array.isArray(value)) {
            state.settings[setting] = value.filter(
              v => !columnsToRemove.includes(v),
            );
          }
        });
      });
  },
});

const visualizerSlice = createSlice({
  name: "visualizer",
  initialState: getInitialState(),
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
    toggleFullscreenMode: state => {
      state.isFullscreen = !state.isFullscreen;
      if (!state.isFullscreen) {
        state.isVizSettingsSidebarOpen = false;
      }
    },
    turnOffFullscreenMode: state => {
      state.isFullscreen = false;
      state.isVizSettingsSidebarOpen = false;
    },
    toggleVizSettingsSidebar: state => {
      state.isVizSettingsSidebarOpen = !state.isVizSettingsSidebarOpen;
    },
    closeVizSettingsSidebar: state => {
      state.isVizSettingsSidebarOpen = false;
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
    resetVisualizer: (
      state,
      action: PayloadAction<{ full?: boolean } | undefined>,
    ) => {
      if (action.payload?.full) {
        Object.assign(state, getInitialState());
      } else {
        state.past = [];
        state.future = [...state.future, state.present];
        state.present = getInitialVisualizerHistoryItem();
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(initializeVisualizer.fulfilled, (state, action) => {
        const initialState = action.payload;
        if (initialState) {
          state.initialState = {
            ...getInitialVisualizerHistoryItem(),
            ...initialState,
          };
        }

        maybeUpdateHistory(state, action);
      })
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

        const isLastDataSource = Object.keys(state.datasets).length === 0;
        if (isLastDataSource) {
          const present = _.clone(state.present);
          state.past = [...state.past, present];
          state.present = getInitialVisualizerHistoryItem();
          state.future = [];
          state.isVizSettingsSidebarOpen = false;
        } else {
          maybeUpdateHistory(state, action);
        }
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
        state.loadingDataSources[`card:${card.id}`] = false;
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
        const dataset = action.payload;
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

function maybeCombineDataset(
  currentState: VisualizerHistoryItem,
  card: Card,
  dataset: Dataset,
) {
  const state = { ...currentState };
  const source = createDataSource("card", card.id, card.name);

  if (
    !state.display ||
    (card.display === state.display && state.columns.length === 0)
  ) {
    return getInitialStateForCardDataSource(card, dataset.data.cols);
  }

  if (
    ["area", "bar", "line"].includes(state.display) &&
    canCombineCard(state.display, state.columns, state.settings, card)
  ) {
    const metrics = card.visualization_settings["graph.metrics"] ?? [];
    const dimensions = card.visualization_settings["graph.dimensions"] ?? [];
    const columns = dataset.data.cols.filter(
      col => metrics.includes(col.name) || dimensions.includes(col.name),
    );
    columns.forEach(column => {
      const columnRef = createVisualizerColumnReference(
        source,
        column,
        extractReferencedColumns(state.columnValuesMapping),
      );
      if (metrics.includes(column.name)) {
        addMetricColumnToCartesianChart(state, column, columnRef, source);
      } else {
        addDimensionColumnToCartesianChart(state, column, columnRef, source);
      }
    });
    return state;
  }

  if (state.display === "funnel" && canCombineCardWithFunnel(card, dataset)) {
    const [column] = dataset.data.cols;
    addScalarToFunnel(state, source, column);
    return state;
  }

  return state;
}

export const { setTitle, updateSettings, addColumn, removeColumn } =
  visualizerHistoryItemSlice.actions;

export const {
  setDraggedItem,
  toggleDataSourceExpanded,
  toggleFullscreenMode,
  turnOffFullscreenMode,
  toggleVizSettingsSidebar,
  closeVizSettingsSidebar,
  undo,
  redo,
  resetVisualizer,
} = visualizerSlice.actions;

export const { reducer } = visualizerSlice;
