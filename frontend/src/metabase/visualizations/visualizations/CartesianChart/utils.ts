import type { EChartsCoreOption } from "echarts/core";

import { isNotNull } from "metabase/lib/types";
import type {
  DataKey,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getDashboardAdjustedSettings } from "metabase/visualizations/shared/settings-adjustments";
import type { HoveredObject } from "metabase/visualizations/types";

export { getDashboardAdjustedSettings };

export const getHoveredSeriesDataKey = (
  seriesModels: SeriesModel[],
  hovered: HoveredObject | null | undefined,
): DataKey | null => {
  const seriesIndex = hovered?.index;
  if (seriesIndex == null) {
    return null;
  }

  return seriesModels[seriesIndex]?.dataKey ?? null;
};

export const getHoveredEChartsSeriesDataKeyAndIndex = (
  seriesModels: SeriesModel[],
  option: EChartsCoreOption,
  hovered: HoveredObject | null | undefined,
) => {
  const hoveredSeriesDataKey = getHoveredSeriesDataKey(seriesModels, hovered);

  const seriesOptions = Array.isArray(option?.series)
    ? option?.series
    : [option?.series].filter(isNotNull);

  // ECharts series contain goal line, trend lines, and timeline events so the series index
  // is different from one in chartModel.seriesModels
  const hoveredEChartsSeriesIndex = seriesOptions.findIndex(
    (series) => series.id === hoveredSeriesDataKey,
  );

  return { hoveredSeriesDataKey, hoveredEChartsSeriesIndex };
};
