import _ from "underscore";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import type { OptionsType } from "metabase/lib/formatting/types";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type {
  ChartDataset,
  ComboChartDataDensity,
  DataKey,
  Datum,
  DimensionModel,
  LabelFormatter,
  LegacySeriesSettingsObjectKey,
  RawValueFormatter,
  SeriesFormatters,
  SeriesModel,
  StackDisplay,
  StackModel,
  StackTotalDataKey,
  StackedSeriesFormatters,
  VizSettingsKey,
  WaterFallChartDataDensity,
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
  CardId,
  DatasetColumn,
  DatasetData,
  RawSeries,
  RowValue,
  SeriesSettings,
  SingleSeries,
} from "metabase-types/api";

import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
} from "../constants/dataset";
import { CHART_STYLE } from "../constants/style";
import { cachedFormatter } from "../utils/formatter";
import { WATERFALL_VALUE_KEY } from "../waterfall/constants";

import { getFormattingOptionsWithoutScaling } from "./util";
import { formatValue } from "metabase/lib/formatting";

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
  hiddenSeries: string[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const hasMultipleCards = rawSeries.length > 1;
  return rawSeries.flatMap((cardDataset, index) => {
    const cardColumns = cardsColumns[index];

    return getCardSeriesModels(
      cardDataset,
      cardColumns,
      hiddenSeries,
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
 * @param {string[]} hiddenSeries - The list of hidden series data keys.
 * @param {boolean} hasMultipleCards — Indicates whether the chart has multiple card combined.
 * @param {ComputedVisualizationSettings} settings — Computed visualization settings.
 * @param {RenderingContext} renderingContext - The rendering context.
 * @returns {SeriesModel[]} The generated series models for the card.
 */
export const getCardSeriesModels = (
  { card, data }: SingleSeries,
  columns: CartesianChartColumns,
  hiddenSeries: string[],
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

      const dataKey = getDatasetKey(metric.column, cardId);

      return {
        name,
        tooltipName,
        color,
        visible: !hiddenSeries.includes(dataKey),
        cardId,
        column: metric.column,
        columnIndex: metric.index,
        dataKey,
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
        ? formatValue(breakoutValue, {
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

    const dataKey = getDatasetKey(metric.column, cardId, breakoutValue);

    return {
      name,
      tooltipName,
      color,
      visible: !hiddenSeries.includes(dataKey),
      cardId,
      column: metric.column,
      columnIndex: metric.index,
      vizSettingsKey,
      legacySeriesSettingsObjectKey,
      dataKey,
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
    columnByCardId: rawSeries.reduce(
      (columnByCardId, series, index) => {
        const cardColumns = cardsColumns[index];
        columnByCardId[series.card.id] = cardColumns.dimension.column;
        return columnByCardId;
      },
      {} as Record<CardId, DatasetColumn>,
    ),
  };
};

export function getStackTotalValue(
  data: Datum,
  stackDataKeys: DataKey[],
  signKey: StackTotalDataKey,
): number | null {
  let stackValue: number | null = data[signKey] != null ? 0 : null;
  stackDataKeys.forEach(stackDataKey => {
    const seriesValue = data[stackDataKey];
    if (
      typeof seriesValue === "number" &&
      ((signKey === POSITIVE_STACK_TOTAL_DATA_KEY && seriesValue >= 0) ||
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

export function getWaterfallChartDataDensity(
  dataset: ChartDataset,
  waterfallLabelFormatter: RawValueFormatter | undefined,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): WaterFallChartDataDensity {
  const type = "waterfall";
  if (
    !settings["graph.show_values"] ||
    settings["graph.label_value_frequency"] === "all"
  ) {
    return {
      type,
      averageLabelWidth: 0,
      totalNumberOfLabels: 0,
    };
  }

  let totalNumberOfLabels = 0;
  let sumOfLabelWidths = 0;

  const fontStyle = {
    family: renderingContext.fontFamily,
    weight: CHART_STYLE.seriesLabels.weight,
    size: CHART_STYLE.seriesLabels.size,
  };

  dataset.forEach(datum => {
    const value = datum[WATERFALL_VALUE_KEY];

    if (value == null) {
      return;
    }

    totalNumberOfLabels += 1;

    if (!waterfallLabelFormatter) {
      return;
    }

    const labelWidth = renderingContext.measureText(
      waterfallLabelFormatter(value),
      fontStyle,
    );

    sumOfLabelWidths += labelWidth;
  });

  const averageLabelWidth =
    totalNumberOfLabels > 0 ? sumOfLabelWidths / totalNumberOfLabels : 0;

  return {
    type,
    averageLabelWidth,
    totalNumberOfLabels,
  };
}

export function getComboChartDataDensity(
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  dataset: ChartDataset,
  seriesLabelsFormatters: SeriesFormatters,
  stackedLabelsFormatters: StackedSeriesFormatters,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): ComboChartDataDensity {
  const type = "combo";
  const seriesSettingsByDataKey = getDisplaySeriesSettingsByDataKey(
    seriesModels,
    stackModels,
    settings,
  );
  const seriesWithSymbols = seriesModels.filter(seriesModel => {
    const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
    return ["area", "line"].includes(seriesSettings.display ?? "");
  });
  const seriesWithLabels = seriesModels.filter(seriesModel => {
    const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
    if (
      ["area", "bar"].includes(seriesSettings.display ?? "") &&
      settings["stackable.stack_type"] != null
    ) {
      return false;
    }

    return seriesSettings["show_series_values"];
  });

  let totalNumberOfDots = 0;

  let totalNumberOfSeriesLabels = 0;
  let totalNumberOfStackedLabels = 0;
  let sumOfSeriesLabelWidths = 0;
  let sumOfStackedSeriesLabelWidths = 0;
  const fontStyle = {
    family: renderingContext.fontFamily,
    weight: CHART_STYLE.seriesLabels.weight,
    size: CHART_STYLE.seriesLabels.size,
  };

  dataset.forEach(datum => {
    totalNumberOfDots += seriesWithSymbols.filter(
      seriesModel => datum[seriesModel.dataKey] != null,
    ).length;

    // if we will not be displaying any labels, we do not have to calculate the
    // label statistics
    if (
      !settings["graph.show_values"] ||
      settings["graph.label_value_frequency"] === "all"
    ) {
      return;
    }

    // series labels count + label width sum
    seriesWithLabels.forEach(seriesModel => {
      const value = datum[seriesModel.dataKey];

      if (value != null) {
        totalNumberOfSeriesLabels += 1;

        const formatter = seriesLabelsFormatters[seriesModel.dataKey];
        sumOfSeriesLabelWidths += formatter
          ? renderingContext.measureText(formatter(value), fontStyle)
          : 0;
      }
    });

    // stacked labels count + stacked label width sum
    if (settings["stackable.stack_type"] !== "normalized") {
      stackModels.forEach(stackModel => {
        const formatter = stackedLabelsFormatters[stackModel.display];

        const positiveStackTotal = getStackTotalValue(
          datum,
          stackModel.seriesKeys,
          POSITIVE_STACK_TOTAL_DATA_KEY,
        );
        const negativeStackTotal = getStackTotalValue(
          datum,
          stackModel.seriesKeys,
          NEGATIVE_STACK_TOTAL_DATA_KEY,
        );

        if (positiveStackTotal !== null) {
          totalNumberOfStackedLabels += 1;

          sumOfStackedSeriesLabelWidths += formatter
            ? renderingContext.measureText(
                formatter(positiveStackTotal),
                fontStyle,
              )
            : 0;
        }
        if (negativeStackTotal !== null) {
          totalNumberOfStackedLabels += 1;

          sumOfStackedSeriesLabelWidths += formatter
            ? renderingContext.measureText(
                formatter(negativeStackTotal),
                fontStyle,
              )
            : 0;
        }
      });
    }
  });

  const sumOfLabelWidths =
    sumOfSeriesLabelWidths + sumOfStackedSeriesLabelWidths;
  const totalNumberOfLabels =
    totalNumberOfSeriesLabels + totalNumberOfStackedLabels;
  const averageLabelWidth =
    totalNumberOfLabels > 0 ? sumOfLabelWidths / totalNumberOfLabels : 0;

  const seriesDataKeysWithLabels: DataKey[] = [];
  const stackedDisplayWithLabels: StackDisplay[] = [];
  seriesDataKeysWithLabels.push(
    ...seriesWithLabels.map(series => series.dataKey),
  );
  if (settings["stackable.stack_type"] !== "normalized") {
    stackedDisplayWithLabels.push(
      ...stackModels.map(stackModel => stackModel.display),
    );
  }

  return {
    type,
    seriesDataKeysWithLabels,
    stackedDisplayWithLabels,
    totalNumberOfDots,
    averageLabelWidth,
    totalNumberOfLabels,
  };
}

export function getDisplaySeriesSettingsByDataKey(
  seriesModels: SeriesModel[],
  stackModels: StackModel[] | null,
  settings: ComputedVisualizationSettings,
) {
  const seriesSettingsByKey = seriesModels.reduce(
    (acc, seriesModel) => {
      acc[seriesModel.dataKey] = settings.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );
      return acc;
    },
    {} as Record<DataKey, SeriesSettings>,
  );

  if (stackModels != null) {
    stackModels.forEach(({ display, seriesKeys }) => {
      seriesKeys.forEach(seriesKey => {
        seriesSettingsByKey[seriesKey].display = display;
      });
    });
  }

  return seriesSettingsByKey;
}
const getStackTotalsFormatters = (
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const hasDataLabels =
    settings["graph.show_values"] &&
    settings["stackable.stack_type"] === "stacked" &&
    (settings["graph.show_stack_values"] === "total" ||
      settings["graph.show_stack_values"] === "all");

  if (!hasDataLabels) {
    return [];
  }

  return stackModels.map(({ display: stackName, seriesKeys }) => {
    const seriesModel = seriesModels.find(s => s.dataKey === seriesKeys[0]);
    if (!seriesModel) {
      throw new Error(`Missing series model for data key: ${seriesKeys[0]}`);
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

    let isCompact: boolean;
    if (settings["graph.label_value_formatting"] === "auto") {
      // if either positive or negative need to be compact formatted
      // compact format both
      isCompact = [POSITIVE_STACK_TOTAL_DATA_KEY, NEGATIVE_STACK_TOTAL_DATA_KEY]
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
    } else {
      isCompact = settings["graph.label_value_formatting"] === "compact";
    }

    return {
      stackName,
      isCompact,
      compactFormatter,
      fullFormatter,
    };
  });
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
      return "";
    }

    // since we already transformed the dataset values, we do not need to
    // consider scaling anymore
    const options = getFormattingOptionsWithoutScaling({
      ...(settings.column?.(seriesModel.column) ?? {}),
      jsx: false,
      compact: isCompact,
      ...formattingOptions,
    });
    return formatValue(value, options);
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
    let isCompact: boolean;
    if (settings["graph.label_value_formatting"] === "auto") {
      isCompact = shouldRenderCompact(
        dataset,
        getValue,
        compactFormatter,
        fullFormatter,
        settings,
      );
    } else {
      isCompact = settings["graph.label_value_formatting"] === "compact";
    }

    return {
      dataKey: seriesModel.dataKey,
      fullFormatter,
      compactFormatter,
      isCompact,
    };
  });
};

const getSeriesLabelsFormatters = (
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  if (!settings["graph.show_values"]) {
    return [];
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

  const nonStackedSeriesFormattingInfo = getSeriesLabelsFormattingInfo(
    nonStackedSeries,
    dataset,
    settings,
    renderingContext,
  );

  // Bar stack series formatters
  const shouldShowStackedBarSeriesLabels =
    settings["graph.show_stack_values"] === "series" ||
    settings["graph.show_stack_values"] === "all";

  if (!shouldShowStackedBarSeriesLabels) {
    return nonStackedSeriesFormattingInfo;
  }

  const barStackSeriesKeys = new Set(
    stackModels.find(stackModel => stackModel.display === "bar")?.seriesKeys ??
      [],
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

  return [...nonStackedSeriesFormattingInfo, ...barSeriesLabelsFormattingInfo];
};

export const getFormatters = (
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): {
  stackedLabelsFormatters: StackedSeriesFormatters;
  seriesLabelsFormatters: SeriesFormatters;
  isCompactFormatting: boolean;
} => {
  const stackTotalsFormattersInfo = getStackTotalsFormatters(
    seriesModels,
    stackModels,
    dataset,
    settings,
    renderingContext,
  );

  const seriesLabelsFormattersInfo = getSeriesLabelsFormatters(
    seriesModels,
    stackModels,
    dataset,
    settings,
    renderingContext,
  );

  const isCompactFormatting =
    settings["graph.label_value_formatting"] === "compact" ||
    stackTotalsFormattersInfo.some(({ isCompact }) => isCompact) ||
    seriesLabelsFormattersInfo.some(({ isCompact }) => isCompact);

  return {
    isCompactFormatting,
    stackedLabelsFormatters: stackTotalsFormattersInfo.reduce(
      (formatterByStackName, formattingInfo) => {
        formatterByStackName[formattingInfo.stackName] = isCompactFormatting
          ? formattingInfo.compactFormatter
          : formattingInfo.fullFormatter;

        return formatterByStackName;
      },
      {} as StackedSeriesFormatters,
    ),
    seriesLabelsFormatters: seriesLabelsFormattersInfo.reduce(
      (formatterBySeriesKey, formattingInfo) => {
        formatterBySeriesKey[formattingInfo.dataKey] = isCompactFormatting
          ? formattingInfo.compactFormatter
          : formattingInfo.fullFormatter;

        return formatterBySeriesKey;
      },
      {} as SeriesFormatters,
    ),
  };
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
