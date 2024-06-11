import _ from "underscore";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import type { OptionsType } from "metabase/lib/formatting/types";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type {
  ChartDataset,
  DataKey,
  Datum,
  DimensionModel,
  LabelFormatter,
  LegacySeriesSettingsObjectKey,
  SeriesFormatters,
  SeriesModel,
  StackModel,
  StackTotalDataKey,
  StackedSeriesFormatters,
  VizSettingsKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import {
  SERIES_COLORS_SETTING_KEY,
  SERIES_SETTING_KEY,
} from "metabase/visualizations/shared/settings/series";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  SingleSeries,
  DatasetData,
  RowValue,
  DatasetColumn,
  RawSeries,
  CardId,
} from "metabase-types/api";

import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
} from "../constants/dataset";
import { cachedFormatter } from "../utils/formatter";
import { WATERFALL_VALUE_KEY } from "../waterfall/constants";

export const getSeriesVizSettingsKey = (
  column: DatasetColumn,
  hasMultipleCards: boolean,
  isFirstCard: boolean,
  metricsCount: number,
  breakoutName: string | null,
  cardName?: string,
): VizSettingsKey => {
  const isBreakoutSeries = breakoutName != null;
  const isSingleMetricCard = metricsCount === 1 && !isBreakoutSeries;

  if (isFirstCard && !isBreakoutSeries) {
    return column.name;
  }

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

export const getCardsSeriesModels = (
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const hasMultipleCards = rawSeries.length > 1;
  return rawSeries.flatMap((cardDataset, index) => {
    const cardColumns = cardsColumns[index];

    return getCardSeriesModels(
      cardDataset,
      cardColumns,
      hasMultipleCards,
      index === 0,
      settings,
      renderingContext,
    );
  });
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
  isFirstCard: boolean,
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
        isFirstCard,
        columns.metrics.length,
        null,
        card.name,
      );
      const legacySeriesSettingsObjectKey =
        createLegacySeriesObjectKey(vizSettingsKey);

      const customName = settings[SERIES_SETTING_KEY]?.[vizSettingsKey]?.title;
      const tooltipName = customName ?? getFriendlyName(metric.column);
      const name =
        customName ??
        getDefaultSeriesName(
          getFriendlyName(metric.column),
          hasMultipleCards,
          columns.metrics.length,
          false,
          card.name,
        );

      const color = settings?.[SERIES_COLORS_SETTING_KEY]?.[vizSettingsKey];

      return {
        name,
        tooltipName,
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
      breakoutValue != null && breakoutValue !== ""
        ? renderingContext.formatValue(breakoutValue, {
            column: breakout.column,
          })
        : NULL_DISPLAY_VALUE;

    const vizSettingsKey = getSeriesVizSettingsKey(
      metric.column,
      hasMultipleCards,
      isFirstCard,
      1,
      formattedBreakoutValue,
      card.name,
    );
    const legacySeriesSettingsObjectKey =
      createLegacySeriesObjectKey(vizSettingsKey);

    const customName = settings[SERIES_SETTING_KEY]?.[vizSettingsKey]?.title;
    const tooltipName = getFriendlyName(metric.column);
    const name =
      customName ??
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
      tooltipName,
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
  cardsColumns: CartesianChartColumns[],
): DimensionModel => {
  return {
    column: cardsColumns[0].dimension.column,
    columnIndex: cardsColumns[0].dimension.index,
    columnByCardId: rawSeries.reduce((columnByCardId, series, index) => {
      const cardColumns = cardsColumns[index];
      columnByCardId[series.card.id] = cardColumns.dimension.column;
      return columnByCardId;
    }, {} as Record<CardId, DatasetColumn>),
  };
};

export function getStackTotalValue(
  data: Datum,
  stackDataKeys: DataKey[],
  signKey: StackTotalDataKey,
): number | null {
  let stackValue: number | null = null;
  stackDataKeys.forEach(stackDataKey => {
    const seriesValue = data[stackDataKey];
    if (
      typeof seriesValue === "number" &&
      ((signKey === POSITIVE_STACK_TOTAL_DATA_KEY && seriesValue > 0) ||
        (signKey === NEGATIVE_STACK_TOTAL_DATA_KEY && seriesValue < 0))
    ) {
      stackValue = (stackValue ?? 0) + seriesValue;
    }
  });

  return stackValue;
}

function shouldRenderCompact(
  dataset: ChartDataset,
  getValue: (datum: Datum) => RowValue | null,
  compactFormatter: LabelFormatter,
  fullFormatter: LabelFormatter,
  settings: ComputedVisualizationSettings,
) {
  if (settings["graph.label_value_formatting"] === "compact") {
    return true;
  }
  if (settings["graph.label_value_formatting"] === "full") {
    return false;
  }
  // for "auto" we use compact if it shortens avg label length by >3 chars
  const getAvgLength = (compact: boolean) => {
    const lengths = dataset.map(datum => {
      const value = getValue(datum);
      return (compact ? compactFormatter(value) : fullFormatter(value)).length;
    });

    return (
      lengths.reduce((sum: number, length: number) => sum + length, 0) /
      lengths.length
    );
  };

  return getAvgLength(true) + 3 < getAvgLength(false);
}

export const getStackedLabelsFormatters = (
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): {
  formatters: StackedSeriesFormatters;
  compactStackedSeriesDataKeys: DataKey[];
} => {
  const formatters: StackedSeriesFormatters = {};
  const compactStackedSeriesDataKeys: DataKey[] = [];

  const hasDataLabels =
    settings["graph.show_values"] &&
    settings["stackable.stack_type"] === "stacked" &&
    (settings["graph.show_stack_values"] === "total" ||
      settings["graph.show_stack_values"] === "all");

  if (!hasDataLabels) {
    return { formatters, compactStackedSeriesDataKeys };
  }

  stackModels.forEach(({ display: stackName, seriesKeys }) => {
    const seriesModel = seriesModels.find(s => s.dataKey === seriesKeys[0]);
    if (!seriesModel) {
      return [];
    }

    const compactFormatter = createSeriesLabelsFormatter(
      seriesModel,
      true,
      {},
      settings,
      renderingContext,
    );
    const fullFormatter = createSeriesLabelsFormatter(
      seriesModel,
      false,
      {},
      settings,
      renderingContext,
    );

    // if either positive or negative need to be compact formatted
    // compact format both
    const isCompact = [
      POSITIVE_STACK_TOTAL_DATA_KEY,
      NEGATIVE_STACK_TOTAL_DATA_KEY,
    ]
      .map(signKey => {
        const getValue = (datum: Datum) =>
          getStackTotalValue(datum, seriesKeys, signKey);

        return shouldRenderCompact(
          dataset,
          getValue,
          compactFormatter,
          fullFormatter,
          settings,
        );
      })
      .some(isCompact => isCompact);

    if (isCompact) {
      compactStackedSeriesDataKeys.push(seriesKeys[0]);
    }

    const stackedFormatter = isCompact ? compactFormatter : fullFormatter;

    formatters[stackName] = stackedFormatter;
  });

  return { formatters, compactStackedSeriesDataKeys };
};

const createSeriesLabelsFormatter = (
  seriesModel: SeriesModel,
  isCompact: boolean,
  formattingOptions: OptionsType,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) =>
  cachedFormatter((value: RowValue) => {
    if (typeof value !== "number") {
      return " ";
    }
    return renderingContext.formatValue(value, {
      ...(settings.column?.(seriesModel.column) ?? {}),
      jsx: false,
      compact: isCompact,
      ...formattingOptions,
    });
  });

const getSeriesLabelsFormattingInfo = (
  seriesModels: SeriesModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  return seriesModels.map(seriesModel => {
    const getValue = (datum: Datum) => datum[seriesModel.dataKey];

    const compactFormatter = createSeriesLabelsFormatter(
      seriesModel,
      true,
      {},
      settings,
      renderingContext,
    );
    const fullFormatter = createSeriesLabelsFormatter(
      seriesModel,
      false,
      {},
      settings,
      renderingContext,
    );
    const isCompact = shouldRenderCompact(
      dataset,
      getValue,
      compactFormatter,
      fullFormatter,
      settings,
    );

    return {
      dataKey: seriesModel.dataKey,
      fullFormatter,
      compactFormatter,
      isCompact,
    };
  });
};

export const getSeriesLabelsFormatters = (
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): {
  formatters: SeriesFormatters;
  compactSeriesDataKeys: DataKey[];
} => {
  const formatters: SeriesFormatters = {};
  const compactSeriesDataKeys: DataKey[] = [];

  if (!settings["graph.show_values"]) {
    return { formatters, compactSeriesDataKeys };
  }

  const seriesModelsWithLabels = seriesModels.filter(seriesModel => {
    const seriesSettings =
      settings.series(seriesModel.legacySeriesSettingsObjectKey) ?? {};

    return !!seriesSettings["show_series_values"];
  });

  // Non-stacked series formatters
  const stackedSeriesKeys = new Set(
    stackModels.flatMap(stackModel => stackModel.seriesKeys),
  );
  const nonStackedSeries = seriesModelsWithLabels.filter(
    seriesModel => !stackedSeriesKeys.has(seriesModel.dataKey),
  );

  getSeriesLabelsFormattingInfo(
    nonStackedSeries,
    dataset,
    settings,
    renderingContext,
  ).forEach(({ isCompact, compactFormatter, fullFormatter, dataKey }) => {
    formatters[dataKey] = isCompact ? compactFormatter : fullFormatter;
    isCompact && compactSeriesDataKeys.push(dataKey);
  });

  // Bar stack series formatters
  const shouldShowStackedBarSeriesLabels =
    settings["graph.show_stack_values"] === "series" ||
    settings["graph.show_stack_values"] === "all";
  if (shouldShowStackedBarSeriesLabels) {
    const barStackSeriesKeys = new Set(
      stackModels.find(stackModel => stackModel.display === "bar")
        ?.seriesKeys ?? [],
    );
    const barStackSeries = seriesModelsWithLabels.filter(seriesModel =>
      barStackSeriesKeys.has(seriesModel.dataKey),
    );
    const barSeriesLabelsFormattingInfo = getSeriesLabelsFormattingInfo(
      barStackSeries,
      dataset,
      settings,
      renderingContext,
    );
    const shouldApplyCompactFormattingToBarStack =
      barSeriesLabelsFormattingInfo.some(({ isCompact }) => isCompact);

    barSeriesLabelsFormattingInfo.forEach(
      ({ compactFormatter, fullFormatter, dataKey }) => {
        formatters[dataKey] = shouldApplyCompactFormattingToBarStack
          ? compactFormatter
          : fullFormatter;

        shouldApplyCompactFormattingToBarStack &&
          compactSeriesDataKeys.push(dataKey);
      },
    );
  }

  return { formatters, compactSeriesDataKeys };
};

export const getWaterfallLabelFormatter = (
  seriesModel: SeriesModel,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): { formatter?: LabelFormatter; isCompact?: boolean } => {
  const hasDataLabels = settings["graph.show_values"];

  if (!hasDataLabels) {
    return {};
  }

  const getValue = (datum: Datum) => datum[WATERFALL_VALUE_KEY];

  const waterfallFormattingOptions = { negativeInParentheses: true };

  const compactFormatter = createSeriesLabelsFormatter(
    seriesModel,
    true,
    waterfallFormattingOptions,
    settings,
    renderingContext,
  );
  const fullFormatter = createSeriesLabelsFormatter(
    seriesModel,
    false,
    waterfallFormattingOptions,
    settings,
    renderingContext,
  );
  const isCompact = shouldRenderCompact(
    dataset,
    getValue,
    compactFormatter,
    fullFormatter,
    settings,
  );

  const formatter = isCompact ? compactFormatter : fullFormatter;

  return { formatter, isCompact };
};
