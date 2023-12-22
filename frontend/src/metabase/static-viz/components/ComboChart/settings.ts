import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

import {
  SERIES_COLORS_SETTING_KEY,
  getSeriesColors,
  getSeriesDefaultDisplay,
  getSeriesDefaultLinearInterpolate,
  getSeriesDefaultLineMarker,
  getSeriesDefaultLineMissing,
  getSeriesDefaultShowSeriesValues,
  SERIES_SETTING_KEY,
} from "metabase/visualizations/shared/settings/series";
import { getCommonStaticVizSettings } from "metabase/static-viz/lib/settings";
import {
  getDefaultBubbleSizeCol,
  getDefaultIsHistogram,
  getDefaultIsNumeric,
  getDefaultIsTimeSeries,
  getDefaultStackingValue,
  getDefaultXAxisScale,
  getDefaultXAxisTitle,
  getDefaultYAxisTitle,
  getIsXAxisLabelEnabledDefault,
  getIsYAxisLabelEnabledDefault,
  getSeriesOrderVisibilitySettings,
  isStackingValueValid,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import {
  getCardsColumns,
  getCardsSeriesModels,
} from "metabase/visualizations/echarts/cartesian/model";
import { getDimensionModel } from "metabase/visualizations/echarts/cartesian/model/series";
import type { LegacySeriesSettingsObjectKey } from "metabase/visualizations/echarts/cartesian/model/types";

const fillWithDefaultValue = (
  settings: Record<string, unknown>,
  key: string,
  defaultValue: unknown,
  isValid = true,
) => {
  if (typeof settings[key] === "undefined" || !isValid) {
    settings[key] = defaultValue;
  }
};

const getSeriesFunction = (
  rawSeries: RawSeries,
  settings: Partial<ComputedVisualizationSettings>,
  keys: string[],
) => {
  return (legacySeriesObject: LegacySeriesSettingsObjectKey) => {
    const seriesSettings = settings[SERIES_SETTING_KEY] ?? {};
    const key = legacySeriesObject.card._seriesKey;
    const singleSeriesSettings = seriesSettings[key] ?? {};

    fillWithDefaultValue(
      singleSeriesSettings,
      "display",
      getSeriesDefaultDisplay(rawSeries[0].card.display, keys.indexOf(key)),
    );

    fillWithDefaultValue(
      singleSeriesSettings,
      "line.interpolate",
      getSeriesDefaultLinearInterpolate(settings),
    );

    fillWithDefaultValue(
      singleSeriesSettings,
      "line.marker_enabled",
      getSeriesDefaultLineMarker(settings),
    );

    fillWithDefaultValue(
      singleSeriesSettings,
      "line.missing",
      getSeriesDefaultLineMissing(settings),
    );

    fillWithDefaultValue(
      singleSeriesSettings,
      "show_series_values",
      getSeriesDefaultShowSeriesValues(settings),
    );

    return singleSeriesSettings;
  };
};

// This function should be in sync with the dynamic chart settings definitions logic.
// The only reason it exists is the inability to import settings definitions with the
// settings computation code in the static rendering environment
export const computeStaticComboChartSettings = (
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
  renderingContext: RenderingContext,
): ComputedVisualizationSettings => {
  const { card: mainCard, data: mainDataset } = rawSeries[0];
  const settings = getCommonStaticVizSettings(rawSeries, dashcardSettings);

  const cardsColumns = getCardsColumns(rawSeries, settings);
  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);
  const seriesModels = getCardsSeriesModels(
    rawSeries,
    cardsColumns,
    settings,
    renderingContext,
  );

  const seriesVizSettingsKeys = seriesModels.map(
    seriesModel => seriesModel.vizSettingsKey,
  );

  settings[SERIES_COLORS_SETTING_KEY] = getSeriesColors(
    seriesVizSettingsKeys,
    settings,
  );
  settings.series = getSeriesFunction(
    rawSeries,
    settings,
    seriesVizSettingsKeys,
  );

  fillWithDefaultValue(
    settings,
    "stackable.stack_type",
    getDefaultStackingValue(settings, mainCard),
    isStackingValueValid(
      settings,
      seriesModels.map(
        seriesModel =>
          settings.series(seriesModel.legacySeriesSettingsObjectKey).display,
      ),
    ),
  );

  fillWithDefaultValue(
    settings,
    "graph.series_order",
    getSeriesOrderVisibilitySettings(settings, seriesVizSettingsKeys),
  );

  fillWithDefaultValue(
    settings,
    "graph.y_axis.title_text",
    getDefaultYAxisTitle(
      seriesModels.map(seriesModel => seriesModel.column.display_name),
    ),
  );

  fillWithDefaultValue(
    settings,
    "graph.y_axis.labels_enabled",
    getIsYAxisLabelEnabledDefault(),
  );

  fillWithDefaultValue(
    settings,
    "graph.x_axis.labels_enabled",
    getIsXAxisLabelEnabledDefault(),
  );

  fillWithDefaultValue(
    settings,
    "graph.x_axis.title_text",
    getDefaultXAxisTitle(dimensionModel.column),
  );

  fillWithDefaultValue(settings, "graph.x_axis.axis_enabled", true);

  fillWithDefaultValue(settings, "graph.y_axis.axis_enabled", true);

  fillWithDefaultValue(
    settings,
    "graph.y_axis.title_text",
    getDefaultYAxisTitle(
      seriesModels.map(seriesModel => seriesModel.column.display_name),
    ),
  );

  fillWithDefaultValue(
    settings,
    "graph.y_axis.labels_enabled",
    getIsYAxisLabelEnabledDefault(),
  );

  fillWithDefaultValue(
    settings,
    "graph.x_axis.labels_enabled",
    getIsXAxisLabelEnabledDefault(),
  );

  fillWithDefaultValue(
    settings,
    "graph.x_axis.title_text",
    getDefaultXAxisTitle(dimensionModel.column),
  );

  fillWithDefaultValue(settings, "graph.x_axis.axis_enabled", true);

  fillWithDefaultValue(settings, "graph.y_axis.axis_enabled", true);

  fillWithDefaultValue(
    settings,
    "graph.x_axis._is_numeric",
    getDefaultIsNumeric(mainDataset, dimensionModel.columnIndex),
  );
  fillWithDefaultValue(
    settings,
    "graph.x_axis._is_timeseries",
    getDefaultIsTimeSeries(mainDataset, dimensionModel.columnIndex),
  );
  fillWithDefaultValue(
    settings,
    "graph.x_axis._is_histogram",
    getDefaultIsHistogram(dimensionModel.column),
  );

  fillWithDefaultValue(
    settings,
    "graph.x_axis.scale",
    getDefaultXAxisScale(settings),
  );

  // For scatter plot
  fillWithDefaultValue(
    settings,
    "scatter.bubble",
    getDefaultBubbleSizeCol(mainDataset),
  );

  return settings;
};
