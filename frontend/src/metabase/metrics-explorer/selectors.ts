import { createSelector } from "@reduxjs/toolkit";

import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Dataset, MeasureId, SingleSeries } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type {
  DimensionOverrides,
  DimensionTab,
  DimensionTabType,
  MetricSourceId,
  MetricsExplorerDisplayType,
  MetricsExplorerState,
  ProjectionConfig,
  SelectedMetricInfo,
  SerializedExplorerState,
  SourceData,
  StoredDimensionTab,
} from "metabase-types/store/metrics-explorer";

import type { AvailableColumnsResult } from "./utils/dimensions";
import {
  getAvailableColumnsForPicker,
  hydrateTabColumns,
} from "./utils/dimensions";
import {
  buildMeasureQuery,
  buildModifiedQuery,
  ensureDatetimeBreakout,
  initializeProjectionConfigFromQuery,
} from "./utils/queries";
import {
  getMeasureIdFromSourceId,
  isMeasureSourceId,
  measureToCardId,
  parseSourceId,
} from "./utils/source-ids";
import { stateToSerializedState } from "./utils/url";
import { getVisualizationSettings } from "./utils/visualization-settings";

const STAGE_INDEX = -1;

export const selectMetricsExplorerState = (state: State): MetricsExplorerState =>
  state.metricsExplorer;

export const selectSourceOrder = (state: State): MetricSourceId[] =>
  selectMetricsExplorerState(state).sourceOrder;

export const selectSourceDataById = (
  state: State,
): Record<MetricSourceId, SourceData> =>
  selectMetricsExplorerState(state).sourceDataById;

export const selectResultsById = (
  state: State,
): Record<MetricSourceId, Dataset> =>
  selectMetricsExplorerState(state).resultsById;

export const selectProjectionConfig = (state: State): ProjectionConfig | null =>
  selectMetricsExplorerState(state).projectionConfig;

export const selectDimensionOverrides = (state: State): DimensionOverrides =>
  selectMetricsExplorerState(state).dimensionOverrides;

export const selectDisplayType = (state: State): MetricsExplorerDisplayType =>
  selectMetricsExplorerState(state).displayType;

export const selectLoadingSourceIds = (
  state: State,
): Record<MetricSourceId, boolean> =>
  selectMetricsExplorerState(state).loadingSourceIds;

export const selectLoadingResultIds = (
  state: State,
): Record<MetricSourceId, boolean> =>
  selectMetricsExplorerState(state).loadingResultIds;

export const selectError = (state: State): string | null =>
  selectMetricsExplorerState(state).error;

export const selectActiveTabId = (state: State): string =>
  selectMetricsExplorerState(state).activeTabId;

export const selectStoredDimensionTabs = (state: State): StoredDimensionTab[] =>
  selectMetricsExplorerState(state).dimensionTabs;

export const selectBinningByTab = (
  state: State,
): Record<string, string | null> =>
  selectMetricsExplorerState(state).binningByTab;

export const selectActiveBinning = createSelector(
  [selectBinningByTab, selectActiveTabId],
  (binningByTab, activeTabId): string | null => {
    return binningByTab[activeTabId] ?? null;
  },
);

// Mirrors getSeriesVizSettingsKey in the chart
function getMetricSeriesKey(
  singleSeries: SingleSeries,
  isFirst: boolean,
): string {
  const { card, data } = singleSeries;

  if (isFirst) {
    const metricColumn = data?.cols?.find((col) => col.source === "aggregation");
    if (metricColumn) {
      return metricColumn.name;
    }
    return card.name;
  }

  return card.name;
}

export const selectSourceColors = createSelector(
  [selectSourceOrder, selectSourceDataById, selectResultsById],
  (sourceOrder, sourceDataById, resultsById): Record<number, string> => {
    if (sourceOrder.length === 0) {
      return {};
    }

    const keys: string[] = [];
    const sourceIds: number[] = [];

    sourceOrder.forEach((sourceId, index) => {
      const sourceData = sourceDataById[sourceId];
      const result = resultsById[sourceId];
      if (!sourceData || !result?.data) {
        return;
      }

      const isFirst = index === 0;
      const { id } = parseSourceId(sourceId);

      if (sourceData.type === "metric") {
        const { card } = sourceData.data;
        const singleSeries: SingleSeries = { card, data: result.data };
        keys.push(getMetricSeriesKey(singleSeries, isFirst));
        sourceIds.push(id);
      } else {
        // Measure - use measure name
        keys.push(sourceData.data.measure.name);
        sourceIds.push(id);
      }
    });

    if (keys.length === 0) {
      return {};
    }

    const colorMapping = getColorsForValues(keys);

    const idToColor: Record<number, string> = {};
    sourceIds.forEach((id, index) => {
      const key = keys[index];
      idToColor[id] = colorMapping[key];
    });

    return idToColor;
  },
);

export const selectMeasureSources = createSelector(
  [selectSourceOrder, selectSourceDataById],
  (
    sourceOrder,
    sourceDataById,
  ): { sourceId: MetricSourceId; measureId: MeasureId; tableId: number }[] => {
    const measures: {
      sourceId: MetricSourceId;
      measureId: MeasureId;
      tableId: number;
    }[] = [];

    for (const sourceId of sourceOrder) {
      if (isMeasureSourceId(sourceId)) {
        const sourceData = sourceDataById[sourceId];
        if (sourceData?.type === "measure") {
          measures.push({
            sourceId,
            measureId: getMeasureIdFromSourceId(sourceId),
            tableId: sourceData.tableId,
          });
        }
      }
    }

    return measures;
  },
);

export const selectBaseQueries = createSelector(
  [selectSourceOrder, selectSourceDataById, getMetadata],
  (
    sourceOrder,
    sourceDataById,
    metadata,
  ): Record<MetricSourceId, Lib.Query | null> => {
    const queries: Record<MetricSourceId, Lib.Query | null> = {};

    for (const sourceId of sourceOrder) {
      const sourceData = sourceDataById[sourceId];
      if (!sourceData) {
        queries[sourceId] = null;
        continue;
      }

      if (sourceData.type === "metric") {
        const question = new Question(sourceData.data.card, metadata);
        queries[sourceId] = ensureDatetimeBreakout(question.query());
      } else {
        const measureId = getMeasureIdFromSourceId(sourceId);
        const query = buildMeasureQuery(measureId, sourceData, metadata);
        queries[sourceId] = query;
      }
    }

    return queries;
  },
);

export const selectDimensionTabs = createSelector(
  [selectStoredDimensionTabs, selectBaseQueries],
  (storedTabs, baseQueries): DimensionTab[] => {
    return storedTabs.map((storedTab) => hydrateTabColumns(storedTab, baseQueries));
  },
);

export const selectAvailableColumns = createSelector(
  [selectBaseQueries, selectSourceOrder, selectSourceDataById, selectStoredDimensionTabs],
  (
    baseQueries,
    sourceOrder,
    sourceDataById,
    storedTabs,
  ): AvailableColumnsResult => {
    const existingTabIds = new Set(storedTabs.map((t) => t.id));
    return getAvailableColumnsForPicker(
      baseQueries,
      sourceOrder,
      sourceDataById,
      existingTabIds,
    );
  },
);

export const selectActiveTab = createSelector(
  [selectDimensionTabs, selectActiveTabId],
  (dimensionTabs, activeTabId): DimensionTab | null => {
    if (dimensionTabs.length === 0) {
      return null;
    }

    const activeTab = dimensionTabs.find((tab) => tab.id === activeTabId);
    return activeTab ?? dimensionTabs[0];
  },
);

export const selectActiveTabType = createSelector(
  [selectActiveTab],
  (activeTab): DimensionTabType | null => {
    return activeTab?.type ?? null;
  },
);

export const selectModifiedQueries = createSelector(
  [
    selectBaseQueries,
    selectProjectionConfig,
    selectDimensionOverrides,
    selectActiveTab,
  ],
  (
    baseQueries,
    projectionConfig,
    dimensionOverrides,
    activeTab,
  ): Record<MetricSourceId, Lib.Query | null> => {
    const queries: Record<MetricSourceId, Lib.Query | null> = {};
    const tabType = activeTab?.type;

    for (const [sourceId, baseQuery] of Object.entries(baseQueries)) {
      if (!baseQuery) {
        queries[sourceId as MetricSourceId] = null;
        continue;
      }

      // Find if this source has a matching column for the active tab
      const tabColumn = activeTab?.columnsBySource.find(
        (col) => col.sourceId === sourceId,
      );
      const tabColumnName = tabColumn?.columnName;

      // Build query - returns null if source doesn't have matching column
      const dimensionOverride = dimensionOverrides[sourceId as MetricSourceId];
      queries[sourceId as MetricSourceId] = buildModifiedQuery(
        baseQuery,
        projectionConfig,
        tabType,
        tabColumnName,
        dimensionOverride,
      );
    }

    return queries;
  },
);

export const selectModifiedQueryForSource = (
  state: State,
  sourceId: MetricSourceId,
): Lib.Query | null => {
  const queries = selectModifiedQueries(state);
  return queries[sourceId] ?? null;
};

export const selectRawSeries = createSelector(
  [
    selectSourceOrder,
    selectSourceDataById,
    selectModifiedQueries,
    selectResultsById,
    selectDisplayType,
  ],
  (
    sourceOrder,
    sourceDataById,
    modifiedQueries,
    resultsById,
    displayType,
  ): SingleSeries[] => {
    const validSeries: SingleSeries[] = [];
    let vizSettings: Record<string, unknown> | null = null;

    for (const sourceId of sourceOrder) {
      const sourceData = sourceDataById[sourceId];
      const query = modifiedQueries[sourceId];
      const result = resultsById[sourceId];

      if (!sourceData || !query || !result?.data?.cols?.length) {
        continue;
      }

      const breakouts = Lib.breakouts(query, STAGE_INDEX);
      if (breakouts.length === 0) {
        continue;
      }

      if (vizSettings === null) {
        vizSettings = getVisualizationSettings(displayType, {
          query,
          resultData: result.data,
        });
      }

      if (sourceData.type === "metric") {
        const { card } = sourceData.data;

        validSeries.push({
          card: {
            ...card,
            display: displayType,
            visualization_settings: {
              ...card.visualization_settings,
              ...vizSettings,
            },
          },
          data: result.data,
        });
      } else {
        const { id } = parseSourceId(sourceId);
        const syntheticCard = {
          id: measureToCardId(id),
          name: sourceData.data.measure.name,
          display: displayType,
          visualization_settings: vizSettings,
        } as unknown as SingleSeries["card"];

        validSeries.push({
          card: syntheticCard,
          data: result.data,
        });
      }
    }

    return validSeries;
  },
);

export const selectDimensionItems = createSelector(
  [selectSourceOrder, selectModifiedQueries, selectSourceColors],
  (sourceOrder, modifiedQueries, sourceColors): DimensionItem[] => {
    const items: DimensionItem[] = [];

    for (const sourceId of sourceOrder) {
      const query = modifiedQueries[sourceId];
      if (!query) {
        continue;
      }

      const breakouts = Lib.breakouts(query, STAGE_INDEX);
      if (breakouts.length === 0) {
        continue;
      }

      const column = Lib.breakoutColumn(query, STAGE_INDEX, breakouts[0]);
      if (!column) {
        continue;
      }

      const { id } = parseSourceId(sourceId);
      const itemId = isMeasureSourceId(sourceId) ? measureToCardId(id) : id;

      items.push({
        id: itemId,
        query,
        stageIndex: STAGE_INDEX,
        column,
        color: sourceColors[id],
      });
    }

    return items;
  },
);

export const selectSelectedMetrics = createSelector(
  [selectSourceOrder, selectSourceDataById, selectLoadingSourceIds],
  (sourceOrder, sourceDataById, loadingSourceIds): SelectedMetricInfo[] => {
    return sourceOrder.map((sourceId): SelectedMetricInfo => {
      const sourceData = sourceDataById[sourceId];
      const { type, id } = parseSourceId(sourceId);
      const isLoading = Boolean(loadingSourceIds[sourceId]);

      if (type === "metric") {
        const name = sourceData?.type === "metric" ? sourceData.data.card.name : "";
        return {
          sourceType: "metric",
          id,
          sourceId,
          name,
          isLoading,
        };
      } else {
        const measureData = sourceData?.type === "measure" ? sourceData : null;
        return {
          sourceType: "measure",
          id,
          sourceId,
          name: measureData?.data.measure.name ?? "",
          tableId: measureData?.tableId,
          isLoading,
        };
      }
    });
  },
);

export const selectQuestionForControls = createSelector(
  [selectSourceOrder, selectSourceDataById, selectModifiedQueries, getMetadata],
  (sourceOrder, sourceDataById, modifiedQueries, metadata): Question | null => {
    for (const sourceId of sourceOrder) {
      const sourceData = sourceDataById[sourceId];
      const query = modifiedQueries[sourceId];

      if (!sourceData || !query) {
        continue;
      }

      const breakouts = Lib.breakouts(query, STAGE_INDEX);
      if (breakouts.length === 0) {
        continue;
      }

      if (sourceData.type === "metric") {
        const question = new Question(sourceData.data.card, metadata);
        return question.setQuery(query);
      } else {
        return Question.create({
          metadata,
          dataset_query: Lib.toLegacyQuery(query),
        });
      }
    }

    return null;
  },
);

export const selectUrlState = createSelector(
  [
    selectSourceOrder,
    selectSourceDataById,
    selectProjectionConfig,
    selectDimensionOverrides,
    selectDisplayType,
    selectActiveTabId,
    selectStoredDimensionTabs,
  ],
  (
    sourceOrder,
    sourceDataById,
    projectionConfig,
    dimensionOverrides,
    displayType,
    activeTabId,
    dimensionTabs,
  ): SerializedExplorerState => {
    return stateToSerializedState(
      sourceOrder,
      sourceDataById,
      projectionConfig,
      dimensionOverrides,
      displayType,
      activeTabId,
      dimensionTabs,
    );
  },
);

export const selectIsLoading = createSelector(
  [selectLoadingSourceIds, selectLoadingResultIds],
  (loadingSourceIds, loadingResultIds): boolean => {
    return (
      Object.keys(loadingSourceIds).length > 0 ||
      Object.keys(loadingResultIds).length > 0
    );
  },
);

export const selectDefaultProjectionConfig = createSelector(
  [selectBaseQueries, selectSourceOrder],
  (baseQueries, sourceOrder): ProjectionConfig | null => {
    for (const sourceId of sourceOrder) {
      const query = baseQueries[sourceId];
      if (query) {
        return initializeProjectionConfigFromQuery(query);
      }
    }
    return null;
  },
);
