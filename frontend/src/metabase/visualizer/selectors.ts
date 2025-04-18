import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { utf8_to_b64 } from "metabase/lib/encoding";
import {
  extractRemappings,
  getVisualization,
  getVisualizationTransformed,
  isCartesianChart,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  Card,
  DatasetData,
  RawSeries,
  SingleSeries,
} from "metabase-types/api";
import type {
  VisualizerHistoryItem,
  VisualizerState,
} from "metabase-types/store/visualizer";

import {
  createDataSource,
  extractReferencedColumns,
  mergeVisualizerData,
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "./utils";

type State = { visualizer: VisualizerState };

// Private selectors

const getCurrentHistoryItem = (state: State) => state.visualizer.present;

const getVisualizationColumns = (state: State) =>
  getCurrentHistoryItem(state).columns;

const getVisualizerColumnValuesMapping = (state: State) =>
  getCurrentHistoryItem(state).columnValuesMapping;

// Public selectors

export const getVisualizerRawSettings = (state: State) =>
  getCurrentHistoryItem(state).settings;

export const getCards = (state: State) => state.visualizer.cards;

export function getVisualizationTitle(state: State) {
  const settings = getVisualizerRawSettings(state);
  return settings["card.title"];
}

export function getVisualizationType(state: State) {
  return getCurrentHistoryItem(state).display ?? undefined;
}

export const getDatasets = (state: State) => state.visualizer.datasets;

export const getLoadingDatasets = (state: State) =>
  state.visualizer.loadingDatasets;

export const getExpandedDataSources = (state: State) =>
  state.visualizer.expandedDataSources;

export const getIsLoading = createSelector(
  [(state) => state.visualizer.loadingDataSources, getLoadingDatasets],
  (loadingDataSources, loadingDatasets) => {
    return (
      Object.values(loadingDataSources).includes(true) ||
      Object.values(loadingDatasets).includes(true)
    );
  },
);

export const getDraggedItem = (state: State) => state.visualizer.draggedItem;

export const getIsDataSidebarOpen = (state: State) =>
  state.visualizer.isDataSidebarOpen;

export const getIsVizSettingsSidebarOpen = (state: State) =>
  state.visualizer.isVizSettingsSidebarOpen;

export const getIsSwapAffordanceVisible = (state: State) =>
  state.visualizer.isSwapAffordanceVisible;

// #0 is state before its actually initialized, hence the > 1
export const getCanUndo = (state: State) => state.visualizer.past.length > 1;
export const getCanRedo = (state: State) => state.visualizer.future.length > 0;

export const getReferencedColumns = createSelector(
  [getVisualizerColumnValuesMapping],
  (mappings) => extractReferencedColumns(mappings),
);

/**
 * Returns a list of data sources that are used in the current visualization.
 */
export const getDataSources = createSelector([getCards], (cards) =>
  cards.map((card) => createDataSource("card", card.id, card.name)),
);

export const getUsedDataSources = createSelector(
  [getDataSources, getReferencedColumns],
  (dataSources, referencedColumns) => {
    if (dataSources.length === 1) {
      return dataSources;
    }
    const usedDataSourceIds = new Set(
      referencedColumns.map((ref) => ref.sourceId),
    );
    return dataSources.filter((dataSource) =>
      usedDataSourceIds.has(dataSource.id),
    );
  },
);

export const getIsMultiseriesCartesianChart = createSelector(
  [
    getVisualizationType,
    getVisualizerColumnValuesMapping,
    getVisualizerRawSettings,
  ],
  (display, columnValuesMapping, settings) =>
    display &&
    isCartesianChart(display) &&
    shouldSplitVisualizerSeries(columnValuesMapping, settings),
);

const getVisualizerDatasetData = createSelector(
  [
    getUsedDataSources,
    getDatasets,
    getVisualizationColumns,
    getVisualizerColumnValuesMapping,
  ],
  (dataSources, datasets, columns, columnValuesMapping): DatasetData =>
    mergeVisualizerData({
      columns,
      columnValuesMapping,
      datasets,
      dataSources,
    }) as DatasetData,
);

export const getVisualizerDatasetColumns = createSelector(
  [getVisualizerDatasetData],
  (data) => data.cols,
);

const getVisualizerFlatRawSeries = createSelector(
  [getVisualizationType, getVisualizerRawSettings, getVisualizerDatasetData],
  (display, settings, data): RawSeries => {
    if (!display) {
      return [];
    }

    const series: RawSeries = [
      {
        card: {
          display,
          dataset_query: {},
          visualization_settings: settings,
        } as Card,

        data,

        // Certain visualizations memoize settings computation based on series keys
        // This guarantees a visualization always rerenders on changes
        started_at: new Date().toISOString(),
      } as SingleSeries,
    ];

    return series;
  },
);

export const getVisualizerRawSeries = createSelector(
  [
    getVisualizerFlatRawSeries,
    getVisualizerColumnValuesMapping,
    getIsMultiseriesCartesianChart,
  ],
  (flatSeries, columnValuesMapping, isMultiseriesCartesianChart): RawSeries => {
    return isMultiseriesCartesianChart
      ? splitVisualizerSeries(flatSeries, columnValuesMapping)
      : flatSeries;
  },
);

export const getVisualizerTransformedSeries = createSelector(
  [getVisualizerRawSeries],
  (rawSeries) => {
    if (rawSeries.length === 0) {
      return [];
    }
    const { series } = getVisualizationTransformed(
      extractRemappings(rawSeries),
    );
    return series;
  },
);

export const getVisualizerComputedSettings = createSelector(
  [getVisualizerTransformedSeries],
  (series): ComputedVisualizationSettings =>
    series.length > 0 ? getComputedSettingsForSeries(series) : {},
);

export const getVisualizerPrimaryColumn = createSelector(
  [
    getVisualizationType,
    getVisualizerComputedSettings,
    getVisualizerDatasetColumns,
  ],
  (display, settings, columns) => {
    if (!display) {
      return undefined;
    }

    if (isCartesianChart(display)) {
      const dimensionName = settings["graph.dimensions"]?.[0];
      if (dimensionName) {
        return columns.find((column) => column.name === dimensionName);
      }
    }

    return undefined;
  },
);

export const getTabularPreviewSeries = createSelector(
  [getVisualizerFlatRawSeries],
  (rawSeries) => {
    if (rawSeries.length === 0) {
      return [];
    }
    const [{ card, ...rest }] = rawSeries;
    if (card.display === "table") {
      return rawSeries;
    }
    return [
      {
        ...rest,
        card: {
          display: "table",
          dataset_query: {},
          visualization_settings: {},
        } as Card,
      },
    ];
  },
);

export const getCurrentVisualizerState = getCurrentHistoryItem;

export const getIsDirty = createSelector(
  [getCurrentHistoryItem, (state) => state.visualizer.initialState],
  (state, initialState) => {
    return !_.isEqual(state, initialState);
  },
);

export const getVisualizerUrlHash = createSelector(
  [getCurrentVisualizerState],
  (state) => getStateHash(state),
);

export const getPastVisualizerUrlHashes = createSelector(
  [(state) => state.visualizer.past],
  (items) => items.map(getStateHash),
);

export const getFutureVisualizerUrlHashes = createSelector(
  [(state) => state.visualizer.future],
  (items) => items.map(getStateHash),
);

function getStateHash(state: VisualizerHistoryItem) {
  return checkIfStateDirty(state) ? utf8_to_b64(JSON.stringify({ state })) : "";
}

function checkIfStateDirty(state: VisualizerHistoryItem) {
  return (
    !!state.display ||
    state.columns.length > 0 ||
    Object.keys(state.settings).length > 0 ||
    Object.keys(state.columnValuesMapping).length > 0
  );
}

export const getIsRenderable = createSelector(
  [getVisualizationType, getVisualizerRawSeries, getVisualizerComputedSettings],
  (display, rawSeries, settings) => {
    if (!display) {
      return false;
    }

    const visualization = getVisualization(display);

    if (!visualization) {
      return false;
    }

    try {
      visualization.checkRenderable(rawSeries, settings);
      return true;
    } catch (e) {
      return false;
    }
  },
);
