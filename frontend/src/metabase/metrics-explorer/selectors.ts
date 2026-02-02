import { createSelector } from "@reduxjs/toolkit";

import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { findBreakoutClause } from "metabase/querying/filters/components/TimeseriesChrome/utils";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Dataset, MeasureId, SingleSeries, TimeseriesDisplayType } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type {
  DimensionOverrides,
  MetricSourceId,
  MetricsExplorerState,
  ProjectionConfig,
  SelectedMetricInfo,
  SerializedExplorerState,
  SourceData,
} from "metabase-types/store/metrics-explorer";

import {
  buildMeasureQuery,
  buildModifiedQuery,
  initializeProjectionConfigFromQuery,
} from "./utils/queries";
import {
  getMeasureIdFromSourceId,
  isMeasureSourceId,
  measureToCardId,
  parseSourceId,
} from "./utils/source-ids";
import { stateToSerializedState } from "./utils/url";

const STAGE_INDEX = -1;

// Base selectors
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

export const selectDisplayType = (state: State): TimeseriesDisplayType =>
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

// Derived selectors

/**
 * Get metric series key for color calculation.
 * This mirrors getSeriesVizSettingsKey in the chart.
 */
function getMetricSeriesKey(
  singleSeries: SingleSeries,
  isFirst: boolean,
): string {
  const { card, data } = singleSeries;

  // For first card without breakout, the key is the column name
  if (isFirst) {
    const metricColumn = data?.cols?.find((col) => col.source === "aggregation");
    if (metricColumn) {
      return metricColumn.name;
    }
    return card.name;
  }

  // For subsequent cards, use card name
  return card.name;
}

/**
 * Select source colors - single source of truth for colors.
 * Uses resultsById to get actual query results for color key calculation.
 */
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

/**
 * Select measure sources with their data.
 */
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

/**
 * Select base queries for all sources (before modifications).
 */
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
        queries[sourceId] = Lib.ensureDatetimeBreakout(question.query());
      } else {
        const measureId = getMeasureIdFromSourceId(sourceId);
        const query = buildMeasureQuery(measureId, sourceData, metadata);
        queries[sourceId] = query;
      }
    }

    return queries;
  },
);

/**
 * Select modified queries for all sources (with projection + dimension overrides).
 */
export const selectModifiedQueries = createSelector(
  [selectBaseQueries, selectProjectionConfig, selectDimensionOverrides],
  (
    baseQueries,
    projectionConfig,
    dimensionOverrides,
  ): Record<MetricSourceId, Lib.Query | null> => {
    const queries: Record<MetricSourceId, Lib.Query | null> = {};

    for (const [sourceId, baseQuery] of Object.entries(baseQueries)) {
      if (!baseQuery) {
        queries[sourceId as MetricSourceId] = null;
        continue;
      }

      const dimensionOverride = dimensionOverrides[sourceId as MetricSourceId];
      queries[sourceId as MetricSourceId] = buildModifiedQuery(
        baseQuery,
        projectionConfig,
        dimensionOverride,
      );
    }

    return queries;
  },
);

/**
 * Select the modified query for a specific source.
 */
export const selectModifiedQueryForSource = (
  state: State,
  sourceId: MetricSourceId,
): Lib.Query | null => {
  const queries = selectModifiedQueries(state);
  return queries[sourceId] ?? null;
};

/**
 * Select raw series for visualization.
 * Simple: use resultsById which contains the query results with projection config applied.
 * Returns empty array when no valid series are available.
 */
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

    for (const sourceId of sourceOrder) {
      const sourceData = sourceDataById[sourceId];
      const query = modifiedQueries[sourceId];
      const result = resultsById[sourceId];

      // Need source data, query, and result
      if (!sourceData || !query || !result?.data?.cols?.length) {
        continue;
      }

      const breakout = findBreakoutClause(query, STAGE_INDEX);
      if (!breakout) {
        continue;
      }

      if (sourceData.type === "metric") {
        const { card } = sourceData.data;

        validSeries.push({
          card: {
            ...card,
            display: displayType,
            visualization_settings: {
              ...card.visualization_settings,
              "graph.x_axis.labels_enabled": false,
              "graph.y_axis.labels_enabled": false,
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
          visualization_settings: {
            "graph.x_axis.labels_enabled": false,
            "graph.y_axis.labels_enabled": false,
          },
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

/**
 * Select dimension items for pill bar.
 */
export const selectDimensionItems = createSelector(
  [selectSourceOrder, selectModifiedQueries, selectSourceColors],
  (sourceOrder, modifiedQueries, sourceColors): DimensionItem[] => {
    const items: DimensionItem[] = [];

    for (const sourceId of sourceOrder) {
      const query = modifiedQueries[sourceId];
      if (!query) {
        continue;
      }

      const breakout = findBreakoutClause(query, STAGE_INDEX);
      if (!breakout) {
        continue;
      }

      const column = Lib.breakoutColumn(query, STAGE_INDEX, breakout);
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

/**
 * Select selected metrics info for search input.
 */
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

/**
 * Select question for chart controls.
 */
export const selectQuestionForControls = createSelector(
  [selectSourceOrder, selectSourceDataById, selectModifiedQueries, getMetadata],
  (sourceOrder, sourceDataById, modifiedQueries, metadata): Question | null => {
    for (const sourceId of sourceOrder) {
      const sourceData = sourceDataById[sourceId];
      const query = modifiedQueries[sourceId];

      if (!sourceData || !query) {
        continue;
      }

      const breakout = findBreakoutClause(query, STAGE_INDEX);
      if (!breakout) {
        continue;
      }

      if (sourceData.type === "metric") {
        const question = new Question(sourceData.data.card, metadata);
        return question.setQuery(query);
      } else {
        // Create a Question from the measure query
        return Question.create({
          metadata,
          dataset_query: Lib.toLegacyQuery(query),
        });
      }
    }

    return null;
  },
);

/**
 * Select URL state serialized for URL building.
 */
export const selectUrlState = createSelector(
  [
    selectSourceOrder,
    selectSourceDataById,
    selectProjectionConfig,
    selectDimensionOverrides,
    selectDisplayType,
  ],
  (
    sourceOrder,
    sourceDataById,
    projectionConfig,
    dimensionOverrides,
    displayType,
  ): SerializedExplorerState => {
    return stateToSerializedState(
      sourceOrder,
      sourceDataById,
      projectionConfig,
      dimensionOverrides,
      displayType,
    );
  },
);

/**
 * Select combined loading state.
 */
export const selectIsLoading = createSelector(
  [selectLoadingSourceIds, selectLoadingResultIds],
  (loadingSourceIds, loadingResultIds): boolean => {
    return (
      Object.keys(loadingSourceIds).length > 0 ||
      Object.keys(loadingResultIds).length > 0
    );
  },
);

/**
 * Select the default projection config from the first available query.
 */
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
