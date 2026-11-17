import type { YAXisOption } from "echarts/types/dist/shared";
import { match } from "ts-pattern";

import { isNotNull } from "metabase/utils/types";
import type { ColumnSettings } from "metabase-types/api";

import { getGoalLineValue } from "../../../lib/dynamic-goals";
import type { ComputedVisualizationSettings, Extent } from "../../../types";
import type { ChartLayout } from "../layout/types";
import type { BaseCartesianChartModel, YAxisModel } from "../model/types";

import {
  type ValueAxisOption,
  getDurationYAxisTicks,
  getResponsiveDurationYAxisTicks,
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

function isDurationAxis(
  axisModel: YAxisModel,
  columnSettings: ColumnSettings,
  settings: ComputedVisualizationSettings,
) {
  return (
    !axisModel.isNormalized &&
    settings["graph.y_axis.scale"] === "linear" &&
    columnSettings.number_style === "duration"
  );
}

function isResponsiveAxis(
  axisModel: YAxisModel,
  settings: ComputedVisualizationSettings,
) {
  const hasCustomSplitNumber = settings["graph.y_axis.split_number"] > 0;
  return axisModel.hasResponsiveTicks === true && !hasCustomSplitNumber;
}

function getYAxisTicks(
  axis: ValueAxisOption,
  axisModel: YAxisModel,
  extent: Extent,
  height: number,
  settings: ComputedVisualizationSettings,
): YAXisOption {
  const columnSettings = settings.column?.(axisModel.column) ?? {};

  return match({
    isDuration: isDurationAxis(axisModel, columnSettings, settings),
    isResponsive: isResponsiveAxis(axisModel, settings),
  })
    .with({ isDuration: true, isResponsive: true }, () =>
      getResponsiveDurationYAxisTicks(extent, axis, height, columnSettings),
    )
    .with({ isDuration: true, isResponsive: false }, () =>
      getDurationYAxisTicks(
        extent,
        axis,
        axisModel.splitNumber,
        columnSettings,
      ),
    )
    .with({ isDuration: false, isResponsive: true }, () =>
      getResponsiveYAxisTicks(extent, axis, height),
    )
    .with({ isDuration: false, isResponsive: false }, () => axis)
    .exhaustive();
}

export function applyYAxisTicks(
  axes: YAXisOption[],
  chartModel: ChartAxisModels,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
): YAXisOption[] {
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
    return getYAxisTicks(axis, axisModel, extent, height, settings);
  });
}
