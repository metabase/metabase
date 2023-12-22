import type {
  SingleSeries,
  DatasetData,
  RowValue,
  RawSeries,
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

export const getSeriesVizSettingsKey = (
  columnNameOrFormattedBreakoutValue: string,
  isFirstCard: boolean,
  hasMultipleCards: boolean,
  metricsCount: number,
  isBreakoutSeries: boolean,
  cardName?: string,
): VizSettingsKey => {
  const isSingleMetricCard = metricsCount === 1 && !isBreakoutSeries;

  // When multiple cards are combined and one of them is a single metric card without a breakout,
  // the default series name is the card name.
  if (hasMultipleCards && isSingleMetricCard) {
    return cardName ?? columnNameOrFormattedBreakoutValue;
  }
  // When multiple cards are combined on a dashboard, all cards
  // except the first include the card name in the viz settings key.
  const prefix = isFirstCard || cardName == null ? "" : `${cardName}: `;
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
 * @param {boolean} isFirstCard - Indicates whether the card is the first card in the
 *                                case of combined cards on a dashboard.
 * @param {boolean} hasMultipleCards — Indicates whether the chart has multiple card combined.
 * @param {ComputedVisualizationSettings} settings — Computed visualization settings.
 * @param {RenderingContext} renderingContext - The rendering context.
 * @returns {SeriesModel[]} The generated series models for the card.
 */
export const getCardSeriesModels = (
  { card, data }: SingleSeries,
  columns: CartesianChartColumns,
  isFirstCard: boolean,
  hasMultipleCards: boolean,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): SeriesModel[] => {
  const hasBreakout = "breakout" in columns;

  // Charts without breakout have one series per selected metric column.
  if (!hasBreakout) {
    return columns.metrics.map(metric => {
      const vizSettingsKey = getSeriesVizSettingsKey(
        metric.column.name,
        isFirstCard,
        hasMultipleCards,
        columns.metrics.length,
        false,
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
        cardId: card.id,
        column: metric.column,
        columnIndex: metric.index,
        dataKey: getDatasetKey(metric.column, card.id),
        vizSettingsKey,
        legacySeriesSettingsObjectKey,
      };
    });
  }

  // Charts with breakout have one series per a unique breakout value. They can have only one metric in such cases.
  const { metric, breakout } = columns;
  const breakoutValues = getBreakoutDistinctValues(data, breakout.index);

  return breakoutValues.map(breakoutValue => {
    // Unfortunately, breakout series include formatted breakout values in the key
    // which can be different based on a user's locale.
    const formattedBreakoutValue = renderingContext.formatValue(breakoutValue, {
      column: breakout.column,
    });

    const vizSettingsKey = getSeriesVizSettingsKey(
      formattedBreakoutValue,
      isFirstCard,
      hasMultipleCards,
      1,
      true,
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
      cardId: card.id,
      column: metric.column,
      columnIndex: metric.index,
      vizSettingsKey,
      legacySeriesSettingsObjectKey,
      dataKey: getDatasetKey(metric.column, card.id, breakoutValue),
      breakoutColumnIndex: breakout.index,
      breakoutColumn: breakout.column,
      breakoutValue,
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
