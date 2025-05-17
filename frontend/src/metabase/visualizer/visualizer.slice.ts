import type { DragEndEvent } from "@dnd-kit/core";
import {
  type PayloadAction,
  createAction,
  createSlice,
} from "@reduxjs/toolkit";
import undoable, { combineFilters, includeAction } from "redux-undo";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { createAsyncThunk, createThunkAction } from "metabase/lib/redux";
import { copy } from "metabase/lib/utils";
import { isCartesianChart } from "metabase/visualizations";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import type {
  DraggedItem,
  VisualizerState,
  VisualizerVizDefinitionWithColumns,
} from "metabase-types/store/visualizer";

import {
  getCurrentVisualizerState,
  getVisualizerComputedSettingsForFlatSeries,
  getVisualizerTransformedSeries,
} from "./selectors";
import {
  copyColumn,
  createDataSource,
  createVisualizerColumnReference,
  extractReferencedColumns,
  getColumnVizSettings,
  getDataSourceIdFromNameRef,
  getInitialStateForCardDataSource,
} from "./utils";
import { getUpdatedSettingsForDisplay } from "./utils/get-updated-settings-for-display";
import {
  addColumnToCartesianChart,
  cartesianDropHandler,
  combineWithCartesianChart,
  isCompatibleWithCartesianChart,
  maybeImportDimensionsFromOtherDataSources,
  removeBubbleSizeFromCartesianChart,
  removeColumnFromCartesianChart,
} from "./visualizations/cartesian";
import {
  addColumnToFunnel,
  combineWithFunnel,
  funnelDropHandler,
  removeColumnFromFunnel,
} from "./visualizations/funnel";
import {
  addColumnToPieChart,
  combineWithPieChart,
  pieDropHandler,
  removeColumnFromPieChart,
} from "./visualizations/pie";

function getInitialVisualizerHistoryItem(): VisualizerVizDefinitionWithColumns {
  return {
    display: null,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  };
}

function getInitialState(): VisualizerState {
  return {
    ...getInitialVisualizerHistoryItem(),

    initialState: getInitialVisualizerHistoryItem(),

    cards: [],
    datasets: {},
    loadingDataSources: {},
    loadingDatasets: {},
    error: null,
    draggedItem: null,
  };
}

type InitVisualizerPayload =
  | {
      state?: Partial<VisualizerVizDefinitionWithColumns>;
      cardByEntityId: Record<string, Card>;
    }
  | { card: Card };

export const initializeVisualizer = createAsyncThunk(
  "visualizer/initializeVisualizer",
  async (payload: InitVisualizerPayload, { dispatch, getState }) => {
    if ("card" in payload) {
      const initState = await initializeFromCard(
        payload.card,
        dispatch,
        getState,
      );
      return initState;
    } else {
      return initializeFromState(payload, dispatch);
    }
  },
);

const initializeFromState = async (
  {
    state: initialState = {},
    cardByEntityId,
  }: {
    state?: Partial<VisualizerVizDefinitionWithColumns>;
    cardByEntityId: Record<string, Card>;
  },
  dispatch: Dispatch,
) => {
  const columnRefs = initialState.columnValuesMapping
    ? extractReferencedColumns(initialState.columnValuesMapping)
    : [];
  const dataSourceIds = Array.from(
    new Set(columnRefs.map((ref) => ref.sourceId)),
  );
  await Promise.all(
    dataSourceIds
      .map((sourceId) => {
        const [, cardEntityId] = sourceId.split(":");
        const cardId = cardByEntityId[cardEntityId].id;

        return [
          dispatch(fetchCard({ cardId: Number(cardId), cardEntityId })),
          dispatch(
            fetchCardQuery({
              cardId: Number(cardId),
              cardEntityId: cardEntityId,
            }),
          ),
        ];
      })
      .flat(),
  );
  return copy(initialState);
};

const initializeFromCard = async (
  card: Card,
  dispatch: Dispatch,
  getState: GetState,
) => {
  await dispatch(fetchCard({ cardId: card.id, cardEntityId: card.entity_id }));
  await dispatch(
    fetchCardQuery({ cardId: card.id, cardEntityId: card.entity_id }),
  );
  const { datasets } = getState().visualizer.present;
  const dataset = datasets[`card:${card?.entity_id}`];
  if (!card || !dataset) {
    throw new Error(`Card or dataset not found for ID: ${card.id}`);
  }
  return getInitialStateForCardDataSource(card, dataset);
};

export const addDataSource = createAsyncThunk(
  "visualizer/dataImporter/addDataSource",
  async (
    { cardId, cardEntityId }: { cardId: number; cardEntityId: string },
    { dispatch, getState },
  ) => {
    const state = getCurrentVisualizerState(getState());

    let dataSource: VisualizerDataSource | null = null;
    let dataset: Dataset | null = null;

    // TODO handle rejected requests
    const cardAction = await dispatch(fetchCard({ cardId, cardEntityId }));
    const card = cardAction.payload as Card;
    const cardQueryAction = await dispatch(
      fetchCardQuery({ cardId: card.id, cardEntityId: card.entity_id }),
    );

    dataset = cardQueryAction.payload as Dataset;

    if (
      !state.display ||
      (card.display === state.display && state.columns.length === 0)
    ) {
      return getInitialStateForCardDataSource(card, dataset);
    }

    dataSource = createDataSource("card", card.entity_id, card.name);

    if (!dataSource || !dataset) {
      throw new Error(
        `Could not get data source or dataset for card id: ${cardId}`,
      );
    }

    // Computed settings include all settings with their default values, including derived settings
    const computedSettings =
      getVisualizerComputedSettingsForFlatSeries(getState());

    // When we add a new data source and we want to understand whether it can be combined with the existing data source
    // we only need to look at the data settings such as metrics and dimensions: 'graph.dimensions' and 'graph.metrics' for cartesian charts,
    // 'funnel.metric' and 'funnel.dimension' for funnel charts, etc. If we use full computed settings here, when saving the state
    // we will store all settings with their default values, including derived settings.
    const dataSettings = getColumnVizSettings(state.display);
    const transformedSeries = getVisualizerTransformedSeries(getState());
    const settings = {
      ...transformedSeries[0].card.visualization_settings,
      ..._.pick(computedSettings, dataSettings),
    };

    return maybeCombineDataset(
      {
        ...copy(state),
        settings,
      },
      dataSource,
      dataset,
    );
  },
);

const fetchCard = createAsyncThunk<
  Card,
  { cardId: CardId; cardEntityId: string }
>("visualizer/fetchCard", async ({ cardId }, { dispatch }) => {
  const result = await dispatch(
    cardApi.endpoints.getCard.initiate({ id: cardId }),
  );
  if (result.data != null) {
    return result.data;
  }
  throw new Error("Failed to fetch card");
});

const fetchCardQuery = createAsyncThunk<
  Dataset,
  { cardId: CardId; cardEntityId: string }
>("visualizer/fetchCardQuery", async ({ cardId }, { dispatch }) => {
  const result = await dispatch(
    cardApi.endpoints.getCardQuery.initiate({ cardId, parameters: [] }),
  );
  if (result.data != null) {
    return result.data;
  }
  throw new Error("Failed to fetch card query");
});

export const undo = createAction("visualizer/undo");
export const redo = createAction("visualizer/redo");

const CLEAR_HISTORY = "visualizer/clearHistory";
const clearHistory = createAction(CLEAR_HISTORY);

export const resetVisualizer = createThunkAction(
  CLEAR_HISTORY,
  () => (dispatch) => {
    dispatch(_resetVisualizer());
    dispatch(clearHistory());
  },
);

const visualizerSlice = createSlice({
  name: "visualizer",
  initialState: getInitialState(),
  reducers: {
    setDisplay: (state, action: PayloadAction<VisualizationDisplay>) => {
      const display = action.payload;

      const updatedSettings = getUpdatedSettingsForDisplay(
        state.columnValuesMapping,
        state.columns,
        state.settings,
        state.display,
        display,
      );

      if (updatedSettings) {
        const { columnValuesMapping, columns, settings } = updatedSettings;
        state.columnValuesMapping = columnValuesMapping;
        state.columns = columns;
        state.settings = settings;
      }

      state.display = display;
    },
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
        column: DatasetColumn;
        dataSource: VisualizerDataSource;
      }>,
    ) => {
      const { column: originalColumn, dataSource } = action.payload;

      if (!state.display) {
        return;
      }

      const dataset = state.datasets[dataSource.id];

      const dataSourceMap = Object.fromEntries(
        state.cards.map((card) => {
          const dataSource = createDataSource(
            "card",
            card.entity_id,
            card.name,
          );
          return [dataSource.id, dataSource];
        }),
      );

      const columnRef = createVisualizerColumnReference(
        dataSource,
        originalColumn,
        extractReferencedColumns(state.columnValuesMapping),
      );
      const column = copyColumn(
        columnRef.name,
        originalColumn,
        dataSource.name,
        state.columns,
      );

      if (state.display === "funnel") {
        addColumnToFunnel(
          state,
          column,
          columnRef,
          // Prevents "Type instantiation is excessively deep" error
          dataset as Dataset,
          dataSource,
        );
        return;
      }

      state.columns.push(column);
      state.columnValuesMapping[column.name] = [columnRef];

      if (isCartesianChart(state.display)) {
        addColumnToCartesianChart(
          state,
          column,
          columnRef,
          // Prevents "Type instantiation is excessively deep" error
          dataset as Dataset,
          dataSource,
        );

        const dimension = state.settings["graph.dimensions"] ?? [];
        const isDimension = dimension.includes(column.name);

        if (isDimension && column.id) {
          const datasetMap = _.omit(state.datasets, dataSource.id) as Record<
            string,
            Dataset
          >;
          maybeImportDimensionsFromOtherDataSources(
            state,
            column,
            datasetMap,
            dataSourceMap,
          );
        }
      } else if (state.display === "pie") {
        addColumnToPieChart(state, column);
      }
    },
    removeColumn: (
      state,
      action: PayloadAction<{ name: string; well?: "bubble" | "all" }>,
    ) => {
      const { name, well } = action.payload;
      if (!state.display) {
        return;
      }

      if (isCartesianChart(state.display)) {
        if (well === "all") {
          removeColumnFromCartesianChart(state, name);
          removeBubbleSizeFromCartesianChart(state, name);
        } else if (well === "bubble") {
          removeBubbleSizeFromCartesianChart(state, name);
        } else {
          removeColumnFromCartesianChart(state, name);
        }
      } else if (state.display === "funnel") {
        removeColumnFromFunnel(state, name);
      } else if (state.display === "pie") {
        removeColumnFromPieChart(state, name);
      }
    },
    handleDrop: (state, action: PayloadAction<DragEndEvent>) => {
      state.draggedItem = null;

      if (!state.display) {
        return;
      }

      const event = action.payload;

      if (isCartesianChart(state.display)) {
        cartesianDropHandler(state, event, {
          // Prevents "Type instantiation is excessively deep" error
          datasetMap: state.datasets as Record<VisualizerDataSourceId, Dataset>,
          dataSourceMap: Object.fromEntries(
            state.cards.map((card) => {
              const dataSource = createDataSource(
                "card",
                card.entity_id,
                card.name,
              );
              return [dataSource.id, dataSource];
            }),
          ),
        });
      } else if (state.display === "funnel") {
        funnelDropHandler(state, event);
      } else if (state.display === "pie") {
        pieDropHandler(state, event);
      }
    },
    removeDataSource: (
      state,
      action: PayloadAction<{
        source: VisualizerDataSource;
        forget?: boolean;
      }>,
    ) => {
      const { source } = action.payload;
      if (source.type === "card") {
        const cardEntityId = source.sourceId;
        state.cards = state.cards.filter(
          (card) => card.entity_id !== cardEntityId,
        );
      }
      delete state.loadingDataSources[source.id];
      delete state.datasets[source.id];
      delete state.loadingDatasets[source.id];

      const isLastDataSource = Object.keys(state.datasets).length === 0;
      if (isLastDataSource) {
        Object.assign(state, getInitialVisualizerHistoryItem());
      } else {
        const columnsToRemove: string[] = [];
        const columnVizSettings = state.display
          ? getColumnVizSettings(state.display)
          : [];

        state.columnValuesMapping = _.mapObject(
          state.columnValuesMapping,
          (valueSources, columnName) => {
            const nextValueSources = valueSources.filter((valueSource) => {
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
          (column) => !columnsToRemove.includes(column.name),
        );
        columnsToRemove.forEach((columName) => {
          delete state.columnValuesMapping[columName];
        });
        columnVizSettings.forEach((setting) => {
          const value = state.settings[setting];
          if (columnsToRemove.includes(value)) {
            delete state.settings[setting];
          } else if (Array.isArray(value)) {
            state.settings[setting] = value.filter(
              (v) => !columnsToRemove.includes(v),
            );
          }
        });
      }
    },
    setDraggedItem: (state, action: PayloadAction<DraggedItem | null>) => {
      state.draggedItem = action.payload;
    },
    _resetVisualizer: (state) => {
      Object.assign(state, getInitialState());
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeVisualizer.fulfilled, (state, action) => {
        const initialState = action.payload;
        if (initialState) {
          state.initialState = {
            ...getInitialVisualizerHistoryItem(),
            ...initialState,
          };
        }
        Object.assign(state, initialState);
      })
      .addCase(addDataSource.fulfilled, (state, action) => {
        const nextState = action.payload;
        if (nextState) {
          state.display = nextState.display;
          state.columns = copy(nextState.columns);
          state.columnValuesMapping = copy(nextState.columnValuesMapping);
          state.settings = copy(nextState.settings);
        }
      })
      .addCase(fetchCard.pending, (state, action) => {
        const cardEntityId = action.meta.arg.cardEntityId;
        state.loadingDataSources[`card:${cardEntityId}`] = true;
        state.error = null;
      })
      .addCase(fetchCard.fulfilled, (state, action: PayloadAction<Card>) => {
        const card = action.payload;
        const index = state.cards.findIndex((c) => c.id === card.id);

        // `any` prevents the "Type instantiation is excessively deep" error
        if (index !== -1) {
          state.cards[index] = card as any;
        } else {
          state.cards.push(card as any);
        }

        state.loadingDataSources[`card:${card.entity_id}`] = false;
      })
      .addCase(fetchCard.rejected, (state, action) => {
        const cardEntityId = action.meta.arg.cardEntityId;
        if (cardEntityId) {
          state.loadingDataSources[`card:${cardEntityId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card";
      })
      .addCase(fetchCardQuery.pending, (state, action) => {
        const cardEntityId = action.meta.arg.cardEntityId;
        state.loadingDatasets[`card:${cardEntityId}`] = true;
        state.error = null;
      })
      .addCase(fetchCardQuery.fulfilled, (state, action) => {
        const cardEntityId = action.meta.arg.cardEntityId;
        const dataset = action.payload;

        // `any` prevents the "Type instantiation is excessively deep" error
        state.datasets[`card:${cardEntityId}`] = dataset as any;
        state.loadingDatasets[`card:${cardEntityId}`] = false;
      })
      .addCase(fetchCardQuery.rejected, (state, action) => {
        const cardEntityId = action.meta.arg.cardEntityId;
        if (cardEntityId) {
          state.loadingDatasets[`card:${cardEntityId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card query";
      });
  },
});

function maybeCombineDataset(
  state: VisualizerVizDefinitionWithColumns,
  dataSource: VisualizerDataSource,
  dataset: Dataset,
) {
  if (!state.display) {
    return;
  }

  if (
    isCartesianChart(state.display) &&
    isCompatibleWithCartesianChart(state, dataset)
  ) {
    combineWithCartesianChart(state, dataset, dataSource);
  }

  if (state.display === "pie") {
    combineWithPieChart(state, dataset, dataSource);
  }

  if (state.display === "funnel") {
    combineWithFunnel(state, dataset, dataSource);
  }

  return state;
}

const { _resetVisualizer } = visualizerSlice.actions;

export const {
  addColumn,
  setTitle,
  updateSettings,
  removeColumn,
  removeDataSource,
  setDisplay,
  setDraggedItem,
  handleDrop,
} = visualizerSlice.actions;

export const reducer = undoable(visualizerSlice.reducer, {
  filter: combineFilters(
    includeAction([
      initializeVisualizer.fulfilled.type,
      addColumn.type,
      setTitle.type,
      updateSettings.type,
      removeColumn.type,
      setDisplay.type,
      handleDrop.type,
      removeDataSource.type,
      addDataSource.fulfilled.type,
    ]),
    (action) => action.payload.forget !== true,
  ),
  undoType: undo.type,
  redoType: redo.type,
  clearHistoryType: CLEAR_HISTORY,
  ignoreInitialState: true,
});
