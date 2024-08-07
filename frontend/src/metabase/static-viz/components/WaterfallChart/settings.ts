import { fillWithDefaultValue } from "metabase/static-viz/lib/settings";
import {
  getDefaultDecreaseColor,
  getDefaultIncreaseColor,
  getDefaultShowTotal,
  getDefaultTotalColor,
} from "metabase/visualizations/shared/settings/waterfall";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

import { computeStaticComboChartSettings } from "../ComboChart/settings";

export function computeStaticWaterfallChartSettings(
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
  renderingContext: RenderingContext,
): ComputedVisualizationSettings {
  const settings = computeStaticComboChartSettings(
    rawSeries,
    dashcardSettings,
    renderingContext,
  );

  fillWithDefaultValue(
    settings,
    "waterfall.increase_color",
    getDefaultIncreaseColor(renderingContext),
  );
  fillWithDefaultValue(
    settings,
    "waterfall.decrease_color",
    getDefaultDecreaseColor(renderingContext),
  );
  fillWithDefaultValue(
    settings,
    "waterfall.total_color",
    getDefaultTotalColor(renderingContext),
  );
  fillWithDefaultValue(settings, "waterfall.show_total", getDefaultShowTotal());

  return settings;
}
