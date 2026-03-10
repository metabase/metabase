import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

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
import type { VisualizerState } from "metabase-types/store/visualizer";

import {
  createDataSource,
  extractReferencedColumns,
  mergeVisualizerData,
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "./utils";

type State = {
  visualizer: {
    past: VisualizerState[];
    present: VisualizerState;
    future: VisualizerState[];
  };
};

// Private selectors

const getCurrentHistoryItem = (state: State) => state.visualizer.present;
const getFirstHistoryItem = (state: State) => state.visualizer.past[0];

// Public selectors

export const getVisualizationColumns = (state: State) =>
  getCurrentHistoryItem(state).columns;

export const getVisualizerColumnValuesMapping = (state: State) =>
  getCurrentHistoryItem(state).columnValuesMapping;

export const getVisualizerRawSettings = (state: State) =>
  getCurrentHistoryItem(state).settings;

export const getCards = (state: State) => getCurrentHistoryItem(state).cards;

export function getVisualizationTitle(state: State) {
  // Using computed settings to capture computed default "card.title" value if was not explicitly saved
  const settings = getVisualizerComputedSettings(state);
  return settings["card.title"];
}

export function getVisualizationType(state: State) {
  return getCurrentHistoryItem(state).display ?? undefined;
}

export const getDatasets = (state: State) =>
  getCurrentHistoryItem(state).datasets;

export const getLoadingDatasets = (state: State) =>
  getCurrentHistoryItem(state).loadingDatasets;

export const getIsLoading = createSelector(
  [
    (state) => getCurrentHistoryItem(state).loadingDataSources,
    getLoadingDatasets,
  ],
  (loadingDataSources, loadingDatasets) => {
    return (
      Object.values(loadingDataSources).includes(true) ||
      Object.values(loadingDatasets).includes(true)
    );
  },
);

export const getDraggedItem = (state: State) =>
  getCurrentHistoryItem(state).draggedItem;

export const getHoveredItems = (state: State) =>
  getCurrentHistoryItem(state).hoveredItems;

export const getCanUndo = (state: State) => state.visualizer.past.length > 0;
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
  [getVisualizationType, getVisualizerColumnValuesMapping],
  (display, columnValuesMapping) =>
    display &&
    isCartesianChart(display) &&
    shouldSplitVisualizerSeries(columnValuesMapping),
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
  [
    getVisualizationType,
    getVisualizerRawSettings,
    getVisualizerDatasetData,
    getCards,
    getVisualizerColumnValuesMapping,
  ],
  (display, settings, data, cards, columnValuesMapping): RawSeries => {
    if (!display) {
      return [];
    }

    const series: RawSeries = [
      {
        card: {
          display,
          dataset_query: {},
          name: cards[0].name,
          description: cards[0].description,
          visualization_settings: settings,
        } as Card,

        data,

        columnValuesMapping,

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
    getUsedDataSources,
  ],
  (
    flatSeries,
    columnValuesMapping,
    isMultiseriesCartesianChart,
    dataSources,
  ): RawSeries => {
    const dataSourceNameMap = Object.fromEntries(
      dataSources.map((dataSource) => [dataSource.id, dataSource.name]),
    );
    const series = isMultiseriesCartesianChart
      ? splitVisualizerSeries(
          flatSeries,
          columnValuesMapping,
          dataSourceNameMap,
        )
      : flatSeries;

    return series;
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

// When computing viz settings for a multi-series chart,
// the final object only references columns from the first series
// Which can cause issues in certain cases
export const getVisualizerComputedSettingsForFlatSeries = createSelector(
  [getVisualizerFlatRawSeries],
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
  [getFirstHistoryItem, getCurrentHistoryItem],
  (initialState, state) => {
    return !!initialState && !_.isEqual(initialState, state);
  },
);

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
