import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

import {
  COLOR_SETTING_ID,
  getSeriesColors,
  getSeriesDefaultDisplay,
  getSeriesDefaultLinearInterpolate,
  getSeriesDefaultLineMarker,
  getSeriesDefaultLineMissing,
  getSeriesDefaultShowSeriesValues,
  SETTING_ID,
} from "metabase/visualizations/shared/settings/series";
import { getCommonStaticVizSettings } from "metabase/static-viz/lib/settings";
import {
  getDefaultStackingValue,
  getSeriesOrderVisibilitySettings,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import {
  getCardsColumns,
  getCardsSeriesModels,
} from "metabase/visualizations/echarts/cartesian/model";
import type { LegacySeriesSettingsObjectKey } from "metabase/visualizations/echarts/cartesian/model/types";

const fillWithDefaultValue = (
  settings: Record<string, unknown>,
  key: string,
  defaultValue: unknown,
) => {
  if (typeof settings[key] === "undefined") {
    settings[key] = defaultValue;
  }
};

const getSeriesFunction = (
  rawSeries: RawSeries,
  settings: Partial<ComputedVisualizationSettings>,
  keys: string[],
) => {
  return (legacySeriesObject: LegacySeriesSettingsObjectKey) => {
    const seriesSettings = settings[SETTING_ID] ?? {};
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
  const mainCard = rawSeries[0].card;
  const settings = getCommonStaticVizSettings(rawSeries, dashcardSettings);

  const cardsColumns = getCardsColumns(rawSeries, settings);
  const seriesModels = getCardsSeriesModels(
    rawSeries,
    cardsColumns,
    settings,
    renderingContext,
  );

  const seriesVizSettingsKeys = seriesModels.map(
    seriesModel => seriesModel.vizSettingsKey,
  );

  settings[COLOR_SETTING_ID] = getSeriesColors(seriesVizSettingsKeys, settings);
  settings.series = getSeriesFunction(
    rawSeries,
    settings,
    seriesVizSettingsKeys,
  );

  fillWithDefaultValue(
    settings,
    "stackable.stack_type",
    getDefaultStackingValue(settings, mainCard),
  );

  fillWithDefaultValue(
    settings,
    "graph.series_order",
    getSeriesOrderVisibilitySettings(settings, seriesVizSettingsKeys),
  );

  return settings;
};
