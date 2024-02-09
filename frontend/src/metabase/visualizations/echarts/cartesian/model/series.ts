import type {
  SingleSeries,
  DatasetData,
  RowValue,
  RawSeries,
  DatasetColumn,
} from "metabase-types/api";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  LegacySeriesSettingsObjectKey,
  SeriesModel,
  VizSettingsKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import {
  SERIES_COLORS_SETTING_KEY,
  SERIES_SETTING_KEY,
} from "metabase/visualizations/shared/settings/series";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";

export const getSeriesVizSettingsKey = (
  column: DatasetColumn,
  hasMultipleCards: boolean,
  metricsCount: number,
  breakoutName: string | null,
  cardName?: string,
): VizSettingsKey => {
  const isBreakoutSeries = breakoutName != null;
  const isSingleMetricCard = metricsCount === 1 && !isBreakoutSeries;

  // When multiple cards are combined and one of them is a single metric card without a breakout,
  // the default series name is the card name.
  if (hasMultipleCards && isSingleMetricCard) {
    return cardName ?? column.name;
  }

  const prefix = hasMultipleCards && cardName != null ? `${cardName}: ` : "";
  const columnNameOrFormattedBreakoutValue =
    breakoutName ?? (hasMultipleCards ? column.display_name : column.name);

  return prefix + columnNameOrFormattedBreakoutValue;
};

// HACK: creates a pseudo legacy series object to integrate with the `series` function in computed settings.
// This workaround is necessary for generating a compatible key with `keyForSingleSeries` function,
// ensuring the correct retrieval of series visualization settings based on the provided `seriesVizSettingsKey`.
// Will be replaced with just a string key when implementing the dynamic line/area/bar.
const createLegacySeriesObjectKey = (
  seriesVizSettingsKey: string,
): LegacySeriesSettingsObjectKey => ({
  card: {
    _seriesKey: seriesVizSettingsKey,
  },
});

export const getBreakoutDistinctValues = (
  data: DatasetData,
  breakoutIndex: number,
) => Array.from(new Set<RowValue>(data.rows.map(row => row[breakoutIndex])));

const getDefaultSeriesName = (
  columnDisplayNameOrFormattedBreakoutValue: string,
  hasMultipleCards: boolean,
  metricsCount: number,
  isBreakoutSeries: boolean,
  cardName?: string,
) => {
  // For a single card, including unsaved ones without names, return column name or breakout value
  if (!hasMultipleCards || !cardName) {
    return columnDisplayNameOrFormattedBreakoutValue;
  }

  // When multiple cards are combined and one card has no breakout and only one metric
  // the default series name is the card name
  if (hasMultipleCards && metricsCount === 1 && !isBreakoutSeries) {
    return cardName;
  }

  return `${cardName}: ${columnDisplayNameOrFormattedBreakoutValue}`;
};

/**
 * Generates series models for a given card with a dataset.
 *
 * @param {SingleSeries} singleSeries - The single card and dataset.
 * @param {CartesianChartColumns} columns - The columns model for the card.
 * @param {number} datasetIndex - Index of a dataset.
 * @param {boolean} hasMultipleCards — Indicates whether the chart has multiple card combined.
 * @param {ComputedVisualizationSettings} settings — Computed visualization settings.
 * @param {RenderingContext} renderingContext - The rendering context.
 * @returns {SeriesModel[]} The generated series models for the card.
 */
export const getCardSeriesModels = (
  { card, data }: SingleSeries,
  columns: CartesianChartColumns,
  hasMultipleCards: boolean,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): SeriesModel[] => {
  const cardId = card.id ?? null;
  const hasBreakout = "breakout" in columns;
  // TODO: separate scatter plot and combo charts into separate models
  const hasBubbleSize = "bubbleSize" in columns;

  // Charts without breakout have one series per selected metric column.
  if (!hasBreakout) {
    return columns.metrics.map(metric => {
      const vizSettingsKey = getSeriesVizSettingsKey(
        metric.column,
        hasMultipleCards,
        columns.metrics.length,
        null,
        card.name,
      );
      const legacySeriesSettingsObjectKey =
        createLegacySeriesObjectKey(vizSettingsKey);

      const name =
        settings[SERIES_SETTING_KEY]?.[vizSettingsKey]?.title ??
        getDefaultSeriesName(
          metric.column.display_name,
          hasMultipleCards,
          columns.metrics.length,
          false,
          card.name,
        );

      const color = settings?.[SERIES_COLORS_SETTING_KEY]?.[vizSettingsKey];

      return {
        name,
        color,
        cardId,
        column: metric.column,
        columnIndex: metric.index,
        dataKey: getDatasetKey(metric.column, cardId),
        vizSettingsKey,
        legacySeriesSettingsObjectKey,
        bubbleSizeDataKey:
          hasBubbleSize && columns.bubbleSize != null
            ? getDatasetKey(columns.bubbleSize.column, cardId)
            : undefined,
      };
    });
  }

  // Charts with breakout have one series per a unique breakout value. They can have only one metric in such cases.
  const { metric, breakout } = columns;
  const breakoutValues = getBreakoutDistinctValues(data, breakout.index);

  return breakoutValues.map(breakoutValue => {
    // Unfortunately, breakout series include formatted breakout values in the key
    // which can be different based on a user's locale.
    const formattedBreakoutValue =
      breakoutValue != null
        ? renderingContext.formatValue(breakoutValue, {
            column: breakout.column,
          })
        : NULL_DISPLAY_VALUE;

    const vizSettingsKey = getSeriesVizSettingsKey(
      metric.column,
      hasMultipleCards,
      1,
      formattedBreakoutValue,
      card.name,
    );
    const legacySeriesSettingsObjectKey =
      createLegacySeriesObjectKey(vizSettingsKey);

    const name =
      settings.series_settings?.[vizSettingsKey]?.title ??
      getDefaultSeriesName(
        formattedBreakoutValue,
        hasMultipleCards,
        1, // only one metric when a chart has a breakout
        true,
        card.name,
      );

    const color = settings?.[SERIES_COLORS_SETTING_KEY]?.[vizSettingsKey];

    return {
      name,
      color,
      cardId,
      column: metric.column,
      columnIndex: metric.index,
      vizSettingsKey,
      legacySeriesSettingsObjectKey,
      dataKey: getDatasetKey(metric.column, cardId, breakoutValue),
      breakoutColumnIndex: breakout.index,
      breakoutColumn: breakout.column,
      breakoutValue,
      bubbleSizeDataKey:
        hasBubbleSize && columns.bubbleSize != null
          ? getDatasetKey(columns.bubbleSize.column, cardId, breakoutValue)
          : undefined,
    };
  });
};

export const getDimensionModel = (
  rawSeries: RawSeries,
  cardColumns: CartesianChartColumns[],
) => {
  return {
    dataKey: getDatasetKey(
      cardColumns[0].dimension.column,
      rawSeries[0].card.id,
    ),
    column: cardColumns[0].dimension.column,
    columnIndex: cardColumns[0].dimension.index,
  };
};
