import type { YAXisOption } from "echarts/types/dist/shared";

import { isNotNull } from "metabase/utils/types";

import type { ComputedVisualizationSettings, Extent } from "../../../types";
import type { ChartLayout } from "../layout/types";
import { DEFAULT_Y_AXIS_SPLIT_NUMBER } from "../model/axis";
import type { BaseCartesianChartModel, YAxisModel } from "../model/types";

import { getGoalLineValue } from "./goal-line";
import {
  getDurationYAxisTicks,
  getResponsiveYAxisSegments,
  getResponsiveYAxisTicks,
} from "./y-axis-ticks";

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

  if (
    hasGoal &&
    settings["graph.show_goal"] &&
    settings["graph.goal_value"] != null
  ) {
    includeValue(
      getGoalLineValue(settings["graph.goal_value"], {
        isNormalized: chartModel.leftAxisModel?.isNormalized ?? false,
        toEChartsAxisValue: chartModel.yAxisScaleTransforms.toEChartsAxisValue,
      }),
    );
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

function getDurationOptions(
  axisModel: YAxisModel,
  settings: ComputedVisualizationSettings,
) {
  if (axisModel.isNormalized || settings["graph.y_axis.scale"] !== "linear") {
    return null;
  }
  const columnSettings = settings.column?.(axisModel.column);
  return columnSettings?.number_style === "duration" ? columnSettings : null;
}

export function applyResponsiveYAxisTicks(
  axes: YAXisOption[],
  chartModel: ChartAxisModels,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
): YAXisOption[] {
  const hasCustomSplitNumber = settings["graph.y_axis.split_number"] > 0;
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
    if (axisModel == null || axis.type !== "value") {
      return axis;
    }
    const extent = getAxisExtent(
      axisModel,
      chartModel,
      settings,
      isSplitPanels || index === 0,
    );
    const isResponsive = axisModel.hasResponsiveTicks && !hasCustomSplitNumber;
    const durationOptions = getDurationOptions(axisModel, settings);
    if (durationOptions != null) {
      const maxSegments = isResponsive
        ? getResponsiveYAxisSegments(height)
        : (axisModel.splitNumber ?? DEFAULT_Y_AXIS_SPLIT_NUMBER);
      return getDurationYAxisTicks(extent, axis, maxSegments, durationOptions);
    }
    return isResponsive ? getResponsiveYAxisTicks(extent, axis, height) : axis;
  });
}
