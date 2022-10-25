import { VisualizationSettings } from "metabase-types/api";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import { Series } from "metabase/visualizations/shared/components/RowChart/types";

export const getLabelledSeries = <TDatum>(
  settings: VisualizationSettings,
  series: Series<TDatum>[],
) => {
  const stackOffset = getStackOffset(settings);
  const canShowLabels =
    settings["graph.show_values"] && stackOffset !== "expand";

  if (!canShowLabels) {
    return null;
  }

  return series
    .filter(
      series =>
        settings?.series_settings?.[series.seriesName]?.show_series_values !==
        false,
    )
    .map(series => series.seriesKey);
};

export const getAxesVisibility = (settings: VisualizationSettings) => {
  return {
    hasXAxis: settings["graph.x_axis.axis_enabled"],
    hasYAxis: settings["graph.y_axis.axis_enabled"],
  };
};

export const getXValueRange = (settings: VisualizationSettings) => {
  const isAutoRange = settings["graph.y_axis.auto_range"];

  if (isAutoRange) {
    return undefined;
  }

  return [settings["graph.y_axis.min"], settings["graph.y_axis.max"]];
};

export const getLabels = (settings: VisualizationSettings) => {
  const yLabel =
    settings["graph.x_axis.labels_enabled"] &&
    (settings["graph.x_axis.title_text"]?.length ?? 0) > 0
      ? settings["graph.x_axis.title_text"]
      : undefined;
  const xLabel =
    settings["graph.y_axis.labels_enabled"] &&
    (settings["graph.y_axis.title_text"]?.length ?? 0) > 0
      ? settings["graph.y_axis.title_text"]
      : undefined;
  return {
    xLabel,
    yLabel,
  };
};
