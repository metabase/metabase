import type { DragEndEvent } from "@dnd-kit/core";
import {
  type PayloadAction,
  createAction,
  createSlice,
} from "@reduxjs/toolkit";
import { shallowEqual } from "react-redux";
import undoable, { combineFilters, includeAction } from "redux-undo";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { createAsyncThunk, createThunkAction } from "metabase/lib/redux";
import { copy } from "metabase/lib/utils";
import { isCartesianChart } from "metabase/visualizations";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
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
  DraggedColumn,
  DraggedItem,
  VisualizerState,
  VisualizerVizDefinitionWithColumns,
  VisualizerVizDefinitionWithColumnsAndFallbacks,
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
  parseDataSourceId,
} from "./utils";
import { getUpdatedSettingsForDisplay } from "./utils/get-updated-settings-for-display";
import {
  addColumnToCartesianChart,
  cartesianDropHandler,
  combineWithCartesianChart,
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
    hoveredItems: null,
  };
}

type InitVisualizerPayload =
  | {
      state?: Partial<VisualizerVizDefinitionWithColumns>;
    }
  | { cardId: CardId };

export const initializeVisualizer = createAsyncThunk(
  "visualizer/initializeVisualizer",
  async (payload: InitVisualizerPayload, { dispatch, getState }) => {
    if ("cardId" in payload) {
      const initState = await initializeFromCard(
        payload.cardId,
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
  }: {
    state?: Partial<VisualizerVizDefinitionWithColumnsAndFallbacks>;
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
        const [, cardId] = sourceId.split(":");
        return [
          dispatch(fetchCard(Number(cardId))),
          dispatch(
            fetchCardQuery({
              cardId: Number(cardId),
              fallbacks: initialState.datasetFallbacks,
            }),
          ),
        ];
      })
      .flat(),
  );
  return copy(initialState);
};

export const initializeFromCard = async (
  cardId: number,
  dispatch: Dispatch,
  getState: GetState,
) => {
  await Promise.all([
    dispatch(fetchCard(cardId)),
    dispatch(fetchCardQuery({ cardId })),
  ]);
  const { cards, datasets } = getState().visualizer.present;
  const card = cards.find((card) => card.id === cardId);
  const dataset = datasets[`card:${cardId}`];
  if (!card || !dataset) {
    throw new Error(`Card or dataset not found for ID: ${cardId}`);
  }
  return getInitialStateForCardDataSource(card, dataset);
};

export const addDataSource = createAsyncThunk(
  "visualizer/dataImporter/addDataSource",
  async (id: VisualizerDataSourceId, { dispatch, getState }) => {
    const { type, sourceId } = parseDataSourceId(id);

    const state = getCurrentVisualizerState(getState());

    let dataSource: VisualizerDataSource | null = null;
    let dataset: Dataset | null = null;
    let vizSettings: VisualizationSettings | null = null;

    if (type === "card") {
      // TODO handle rejected requests
      const cardAction = await dispatch(fetchCard(sourceId));
      const cardQueryAction = await dispatch(
        fetchCardQuery({ cardId: sourceId }),
      );

      const card = cardAction.payload as Card;
      dataset = cardQueryAction.payload as Dataset;
      vizSettings = card.visualization_settings || null;

      if (
        !state.display ||
        (card.display === state.display && state.columns.length === 0)
      ) {
        return getInitialStateForCardDataSource(card, dataset);
      }

      dataSource = createDataSource("card", card.id, card.name);
    } else {
      throw new Error(`Unsupported data source type: ${type}`);
    }

    if (!dataSource || !dataset) {
      throw new Error(`Could not get data source or dataset for: ${sourceId}`);
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
      settings,
      dataSource,
      dataset,
      vizSettings,
    );
  },
);

export const addColumn = createAsyncThunk(
  "visualizer/addColumn",
  async (
    payload: { column: DatasetColumn; dataSource: VisualizerDataSource },
    { dispatch, getState },
  ) => {
    const settings = getVisualizerComputedSettingsForFlatSeries(getState());
    dispatch(_addColumn({ ...payload, settings }));
  },
);

export const removeColumn = createAsyncThunk(
  "visualizer/removeColumn",
  async (
    payload: { name: string; well?: "bubble" | "all" },
    { dispatch, getState },
  ) => {
    const settings = getVisualizerComputedSettingsForFlatSeries(getState());
    dispatch(_removeColumn({ ...payload, settings }));
  },
);

export const handleDrop = createAsyncThunk(
  "visualizer/handleDrop",
  async (event: DragEndEvent, { dispatch, getState }) => {
    const settings = getVisualizerComputedSettingsForFlatSeries(getState());
    dispatch(_handleDrop({ event, settings }));
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

const fetchCardQuery = createAsyncThunk<
  Dataset,
  { cardId: CardId; fallbacks?: Record<CardId, Dataset | null | undefined> }
>("visualizer/fetchCardQuery", async ({ cardId, fallbacks }, { dispatch }) => {
  const result = await dispatch(
    cardApi.endpoints.getCardQuery.initiate({ cardId, parameters: [] }),
  );
  if (result.data != null) {
    const shouldAttemptFallback =
      result.data.error_type &&
      !result.data.data?.rows?.length &&
      !result.data.data?.cols?.length;
    if (shouldAttemptFallback) {
      const fallback = fallbacks?.[cardId];
      if (fallback) {
        return fallback;
      }
    }
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
    _addColumn: (
      state,
      action: PayloadAction<{
        column: DatasetColumn;
        dataSource: VisualizerDataSource;
        settings: ComputedVisualizationSettings;
      }>,
    ) => {
      const { column: originalColumn, dataSource, settings } = action.payload;

      if (!state.display) {
        return;
      }

      const dataset = state.datasets[dataSource.id];

      const dataSourceMap = Object.fromEntries(
        state.cards.map((card) => {
          const dataSource = createDataSource("card", card.id, card.name);
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
          settings,
          state.datasets as Record<string, Dataset>,
          column,
          columnRef,
          // Prevents "Type instantiation is excessively deep" error
          dataset as Dataset,
          dataSource,
        );
        return;
      }

      if (isCartesianChart(state.display)) {
        addColumnToCartesianChart(
          state,
          settings,
          state.datasets as Record<string, Dataset>,
          dataset.data.cols,
          column,
          columnRef,
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
            settings,
            column,
            datasetMap,
            dataSourceMap,
          );
        }
      } else if (state.display === "pie") {
        addColumnToPieChart(
          state,
          settings,
          dataset.data.cols,
          column,
          columnRef,
        );
      }
    },
    _removeColumn: (
      state,
      action: PayloadAction<{
        name: string;
        settings: ComputedVisualizationSettings;
        well?: "bubble" | "all";
      }>,
    ) => {
      const { name, well, settings } = action.payload;
      if (!state.display) {
        return;
      }

      if (isCartesianChart(state.display)) {
        if (well === "all") {
          removeColumnFromCartesianChart(state, settings, name);
          removeBubbleSizeFromCartesianChart(state, name);
        } else if (well === "bubble") {
          removeBubbleSizeFromCartesianChart(state, name);
        } else {
          removeColumnFromCartesianChart(state, settings, name);
        }
      } else if (state.display === "funnel") {
        removeColumnFromFunnel(state, settings, name);
      } else if (state.display === "pie") {
        removeColumnFromPieChart(state, settings, name);
      }
    },
    _handleDrop: (
      state,
      action: PayloadAction<{
        event: DragEndEvent;
        settings: ComputedVisualizationSettings;
      }>,
    ) => {
      state.draggedItem = null;

      if (!state.display) {
        return;
      }

      const { event, settings } = action.payload;

      if (isCartesianChart(state.display)) {
        cartesianDropHandler(state, settings, event, {
          // Prevents "Type instantiation is excessively deep" error
          datasetMap: state.datasets as Record<VisualizerDataSourceId, Dataset>,
          dataSourceMap: Object.fromEntries(
            state.cards.map((card) => {
              const dataSource = createDataSource("card", card.id, card.name);
              return [dataSource.id, dataSource];
            }),
          ),
        });
      } else if (state.display === "funnel") {
        funnelDropHandler(state, settings, event);
      } else if (state.display === "pie") {
        pieDropHandler(state, settings, event);
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
        const cardId = source.sourceId;
        state.cards = state.cards.filter((card) => card.id !== cardId);
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
    setHoveredItems: (state, action: PayloadAction<DraggedColumn[] | null>) => {
      state.hoveredItems = action.payload;
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
        const cardId = action.meta.arg;
        state.loadingDataSources[`card:${cardId}`] = true;
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

        state.loadingDataSources[`card:${card.id}`] = false;
      })
      .addCase(fetchCard.rejected, (state, action) => {
        const cardId = action.meta.arg;
        if (cardId) {
          state.loadingDataSources[`card:${cardId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card";
      })
      .addCase(fetchCardQuery.pending, (state, action) => {
        const { cardId } = action.meta.arg;
        state.loadingDatasets[`card:${cardId}`] = true;
        state.error = null;
      })
      .addCase(
        fetchCardQuery.fulfilled,
        (
          state,
          action: { payload: Dataset; meta: { arg: { cardId: CardId } } },
        ) => {
          const { cardId } = action.meta.arg;
          const dataset = action.payload;

          // `any` prevents the "Type instantiation is excessively deep" error
          state.datasets[`card:${cardId}`] = dataset as any;

          state.loadingDatasets[`card:${cardId}`] = false;
        },
      )
      .addCase(fetchCardQuery.rejected, (state, action) => {
        const { cardId } = action.meta.arg;
        if (cardId) {
          state.loadingDatasets[`card:${cardId}`] = false;
        }
        state.error = action.error.message || "Failed to fetch card query";
      });
  },
});

function maybeCombineDataset(
  state: VisualizerVizDefinitionWithColumns,
  settings: ComputedVisualizationSettings,
  dataSource: VisualizerDataSource,
  dataset: Dataset,
  vizSettings: VisualizationSettings | null,
) {
  if (!state.display) {
    return;
  }

  if (isCartesianChart(state.display)) {
    combineWithCartesianChart(
      state,
      settings,
      dataset,
      dataSource,
      vizSettings,
    );
  }

  if (state.display === "pie") {
    combineWithPieChart(state, settings, dataset, dataSource);
  }

  if (state.display === "funnel") {
    combineWithFunnel(state, settings, dataset, dataSource);
  }

  return state;
}

const { _addColumn, _handleDrop, _removeColumn, _resetVisualizer } =
  visualizerSlice.actions;

export const {
  setTitle,
  updateSettings,
  removeDataSource,
  setDisplay,
  setDraggedItem,
  setHoveredItems,
} = visualizerSlice.actions;

export const reducer = undoable(visualizerSlice.reducer, {
  filter: combineFilters(
    includeAction([
      initializeVisualizer.fulfilled.type,
      _addColumn.type,
      setTitle.type,
      updateSettings.type,
      _removeColumn.type,
      setDisplay.type,
      _handleDrop.type,
      removeDataSource.type,
      addDataSource.fulfilled.type,
    ]),
    (action, nextState, { present }) => {
      if (action.payload.forget === true) {
        return false;
      }
      if (action.type !== _handleDrop.type) {
        return true;
      }
      // Prevents history items from being added when dropping an item has no effect on the rest of the visualizer state
      // or when hovered items change — because we don't want to add history items when hovering over items
      const keysToIgnore: (keyof VisualizerState)[] = [
        "draggedItem",
        "hoveredItems",
      ];
      return !shallowEqual(
        _.omit(nextState, keysToIgnore),
        _.omit(present, keysToIgnore),
      );
    },
  ),
  undoType: undo.type,
  redoType: redo.type,
  clearHistoryType: CLEAR_HISTORY,
  ignoreInitialState: true,
});
