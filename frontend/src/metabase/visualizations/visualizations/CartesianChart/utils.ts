import type { EChartsCoreOption } from "echarts/core";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import type {
  BaseCartesianChartModel,
  DataKey,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  HoveredObject,
  VisualizationGridSize,
} from "metabase/visualizations/types";

const getFidelity = (gridSize?: VisualizationGridSize) => {
  const fidelity = { x: 0, y: 0 };
  const size = gridSize || { width: Infinity, height: Infinity };
  if (size.width >= 5) {
    fidelity.x = 2;
  } else if (size.width >= 4) {
    fidelity.x = 1;
  }
  if (size.height >= 5) {
    fidelity.y = 2;
  } else if (size.height >= 4) {
    fidelity.y = 1;
  }

  return fidelity;
};

export const getGridSizeAdjustedSettings = (
  settings: ComputedVisualizationSettings,
  gridSize?: VisualizationGridSize,
) => {
  const fidelity = getFidelity(gridSize);
  const newSettings = { ...settings };

  // smooth interpolation at smallest x/y fidelity
  if (fidelity.x === 0 && fidelity.y === 0) {
    newSettings["line.interpolate"] = "cardinal";
  }

  // no axis in < 1 fidelity
  if (fidelity.x < 1 || fidelity.y < 1) {
    newSettings["graph.y_axis.axis_enabled"] = false;
  }

  // no labels in < 2 fidelity
  if (fidelity.x < 2 || fidelity.y < 2) {
    newSettings["graph.y_axis.labels_enabled"] = false;
  }

  return newSettings;
};

export const MAX_SERIES = 100;

export const validateChartModel = (chartModel: BaseCartesianChartModel) => {
  if (chartModel.seriesModels.length > MAX_SERIES) {
    throw new Error(
      t`This chart type doesn't support more than ${MAX_SERIES} series of data.`,
    );
  }
};

export const getHoveredSeriesDataKey = (
  seriesModels: SeriesModel[],
  hovered: HoveredObject | undefined,
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
  hovered: HoveredObject | undefined,
) => {
  const hoveredSeriesDataKey = getHoveredSeriesDataKey(seriesModels, hovered);

  const seriesOptions = Array.isArray(option?.series)
    ? option?.series
    : [option?.series].filter(isNotNull);

  // ECharts series contain goal line, trend lines, and timeline events so the series index
  // is different from one in chartModel.seriesModels
  const hoveredEChartsSeriesIndex = seriesOptions.findIndex(
    series => series.id === hoveredSeriesDataKey,
  );

  return { hoveredSeriesDataKey, hoveredEChartsSeriesIndex };
};
