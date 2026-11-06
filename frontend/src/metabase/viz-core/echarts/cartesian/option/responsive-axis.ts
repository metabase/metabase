import type { YAXisOption } from "echarts/types/dist/shared";

import { isNotNull } from "metabase/utils/types";

import { getGoalLineValue } from "../../../lib/dynamic-goals";
import type { ComputedVisualizationSettings, Extent } from "../../../types";
import type { ChartLayout } from "../layout/types";
import type { BaseCartesianChartModel, YAxisModel } from "../model/types";

import { getResponsiveYAxisTicks } from "./y-axis-ticks";

type ChartAxisModels = Pick<
  BaseCartesianChartModel,
  | "leftAxisModel"
  | "rightAxisModel"
  | "splitPanelYAxisModels"
  | "trendLinesModel"
  | "yAxisScaleTransforms"
>;

function getAxisExtent(
  axisModel: YAxisModel,
  chartModel: ChartAxisModels,
  settings: ComputedVisualizationSettings,
  hasGoal: boolean,
): Extent {
  let [min, max] = axisModel.extent;
  const includeValue = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  };

  const goalValue = hasGoal
    ? getGoalLineValue(
        settings,
        chartModel.leftAxisModel?.isNormalized ?? false,
      )
    : null;
  if (goalValue !== null) {
    includeValue(chartModel.yAxisScaleTransforms.toEChartsAxisValue(goalValue));
  }

  const trendLines = chartModel.trendLinesModel;
  if (trendLines) {
    for (const { sourceDataKey, dataKey } of trendLines.seriesModels) {
      if (axisModel.seriesKeys.includes(sourceDataKey)) {
        trendLines.extents[dataKey]?.forEach(includeValue);
      }
    }
  }
  return [min, max];
}

export function applyResponsiveYAxisTicks(
  axes: YAXisOption[],
  chartModel: ChartAxisModels,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
): YAXisOption[] {
  if (settings["graph.y_axis.split_number"] > 0) {
    return axes;
  }

  const isSplitPanels = chartLayout.panelHeight != null;
  const axisModels = isSplitPanels
    ? (chartModel.splitPanelYAxisModels ?? [])
    : [chartModel.leftAxisModel, chartModel.rightAxisModel].filter(isNotNull);
  const height =
    chartLayout.panelHeight ??
    chartLayout.outerHeight -
      chartLayout.padding.top -
      chartLayout.padding.bottom;

  return axes.map((axis, index) => {
    const axisModel = axisModels[index];
    if (!axisModel?.hasResponsiveTicks || axis.type !== "value") {
      return axis;
    }
    const extent = getAxisExtent(
      axisModel,
      chartModel,
      settings,
      isSplitPanels || index === 0,
    );
    return getResponsiveYAxisTicks(extent, axis, height);
  });
}
