import {
  type PayloadAction,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { getColumnNameFromKey } from "metabase-lib/v1/queries/utils/column-key";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  RawSeries,
  RowValues,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  DraggedItem,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDatasetColumn,
  VisualizerState,
} from "metabase-types/store/visualizer";

import { createColumnImport, createDataSource } from "./utils";

const initialState: VisualizerState = {
  display: null,
  columns: [],
  importedColumns: [],
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
    importColumn: (
      state,
      action: PayloadAction<{
        column: DatasetColumn;
        dataSource: VisualizerDataSource;
      }>,
    ) => {
      const importedColumn = createColumnImport(
        action.payload.dataSource,
        action.payload.column,
      );
      state.importedColumns.push(importedColumn);

      if (state.display === "funnel" && isNumeric(action.payload.column)) {
        const metricColumnName = state.settings["funnel.metric"];
        const metricColumnIndex = state.columns.findIndex(
          column => column.name === metricColumnName,
        );

        const dimensionColumnName = state.settings["funnel.dimension"];
        const dimensionColumnIndex = state.columns.findIndex(
          column => column.name === dimensionColumnName,
        );

        if (metricColumnIndex !== -1 && dimensionColumnIndex !== -1) {
          const metric = state.columns[metricColumnIndex];
          state.columns[metricColumnIndex] = {
            ...metric,
            values: !metric.values.includes(importedColumn.name)
              ? [...metric.values, importedColumn.name]
              : metric.values,
          };

          const dimension = state.columns[dimensionColumnIndex];
          state.columns[dimensionColumnIndex] = {
            ...dimension,
            values: [
              ...dimension.values,
              `$_${action.payload.dataSource.id}_name`,
            ],
          };
        }
      }
    },
    setDisplay: (state, action: PayloadAction<VisualizationDisplay | null>) => {
      const display = action.payload;

      state.display = display;
      state.settings = {};
      state.importedColumns = [];

      if (display === "funnel") {
        const metric = createMetricColumn();
        const dimension = createDimensionColumn();
        state.columns = [metric, dimension];
        state.settings = {
          "funnel.metric": metric.name,
          "funnel.dimension": dimension.name,
        };
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

      const [removedColumns, remainingColumns] = _.partition(
        state.importedColumns,
      );
      state.importedColumns = remainingColumns;
      const removedColumnsSet = new Set(removedColumns.map(c => c.name));

      if (removedColumnsSet.size > 0) {
        state.columns = state.columns.map(col => ({
          ...col,
          values: col.values.filter(v => {
            if (v.startsWith("$_")) {
              const [_, dataSourceId, __] = v.split("_");
              return dataSourceId !== source.id;
            }
            return !removedColumnsSet.has(v);
          }),
        }));
      }
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
  importColumn,
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

// Must remain private
const getVisualizationColumns = (state: { visualizer: VisualizerState }) =>
  state.visualizer.columns;

export const getImportedColumns = (state: { visualizer: VisualizerState }) =>
  state.visualizer.importedColumns;

export const getDataSources = createSelector([getCards], cards =>
  cards.map(card => createDataSource("card", card.id, card.name)),
);

const getVisualizerDataset = createSelector(
  [getDataSources, getDatasets, getImportedColumns, getVisualizationColumns],
  (dataSources, datasets, importedColumns, cols): Dataset => {
    const importedColumnValuesMap: Record<string, RowValues> = {};
    importedColumns.forEach(columnImport => {
      const dataset = datasets[columnImport.sourceId];
      if (!dataset) {
        return;
      }
      const columnName = getColumnNameFromKey(columnImport.columnKey);
      const columnIndex = dataset.data.cols.findIndex(
        col => col.name === columnName,
      );
      if (columnIndex >= 0) {
        const values = dataset.data.rows.map(row => row[columnIndex]);
        importedColumnValuesMap[columnImport.name] = values;
      }
    });

    const unzippedRows = cols.map(column =>
      column.values
        .map(columnName => {
          if (columnName.startsWith("$_")) {
            const [, dataSourceId] = columnName.split("_");
            const dataSource = dataSources.find(
              source => source.id === dataSourceId,
            );
            return dataSource?.name ? [dataSource.name] : [];
          }
          const values = importedColumnValuesMap[columnName];
          if (!values) {
            return [];
          }
          return values;
        })
        .flat(),
    );

    return {
      cols,
      rows: _.zip(...unzippedRows),
      results_metadata: { columns: cols },
    };
  },
);

export const getVisualizerRawSeries = createSelector(
  [getVisualizationType, getSettings, getVisualizerDataset],
  (display, settings, data): RawSeries => {
    if (!display) {
      return [];
    }
    return [
      {
        card: {
          display,
          visualization_settings: settings,
        },
        data,
      },
    ];
  },
);

export const getVisualizerComputedSettings = createSelector(
  [getVisualizerRawSeries],
  rawSeries =>
    rawSeries.length > 0 ? getComputedSettingsForSeries(rawSeries) : {},
);

function createMetricColumn(): VisualizerDatasetColumn {
  return {
    base_type: "type/Integer",
    effective_type: "type/Integer",
    display_name: "METRIC",
    field_ref: ["field", "METRIC", { "base-type": "type/Integer" }],
    name: "METRIC",
    source: "artificial",

    values: [],
  };
}

function createDimensionColumn(): VisualizerDatasetColumn {
  return {
    base_type: "type/Text",
    effective_type: "type/Text",
    display_name: "DIMENSION",
    field_ref: ["field", "DIMENSION", { "base-type": "type/Text" }],
    name: "DIMENSION",
    source: "artificial",

    values: [],
  };
}
