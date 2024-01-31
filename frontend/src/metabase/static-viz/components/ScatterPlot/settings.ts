import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import type { RenderingContext } from "metabase/visualizations/types";
import { getDefaultBubbleSizeCol } from "metabase/visualizations/shared/settings/cartesian-chart";

import { fillWithDefaultValue } from "metabase/static-viz/lib/settings";
import { computeStaticComboChartSettings } from "../ComboChart/settings";

export function computeStaticScatterPlotSettings(
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
  renderingContext: RenderingContext,
) {
  const settings = computeStaticComboChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );

  fillWithDefaultValue(
    settings,
    "scatter.bubble",
    getDefaultBubbleSizeCol(rawSeries[0].data),
  );

  return settings;
}
