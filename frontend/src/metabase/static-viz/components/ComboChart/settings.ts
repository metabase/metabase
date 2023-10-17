import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

import { getSeriesColors } from "metabase/visualizations/shared/settings/series";
import { getSeriesVizSettingsKey } from "metabase/visualizations/echarts/cartesian/option/series";
import { getCartesianChartSeries } from "metabase/visualizations/echarts/cartesian/model";
import { getCommonStaticVizSettings } from "metabase/static-viz/lib/settings";

// should be in sync with the dynamic chart settings definitions logic
export const computeStaticComboChartSettings = (
  rawSeries: RawSeries,
  renderingContext: RenderingContext,
  dashcardSettings: VisualizationSettings,
): ComputedVisualizationSettings => {
  const settings = getCommonStaticVizSettings(rawSeries, dashcardSettings);

  const cardSeriesModels = getCartesianChartSeries(rawSeries, settings);
  const seriesVizSettingsKeys = cardSeriesModels.flatMap(cardSeriesModel =>
    cardSeriesModel.series.metrics.map(seriesModel =>
      getSeriesVizSettingsKey(seriesModel, renderingContext.formatValue),
    ),
  );

  settings["series_settings.colors"] = getSeriesColors(
    seriesVizSettingsKeys,
    settings,
  );

  // TODO: compute series settings
  return settings;
};
