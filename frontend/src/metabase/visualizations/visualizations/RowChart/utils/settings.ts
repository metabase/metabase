import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import type { Series } from "metabase/visualizations/shared/components/RowChart/types";
import type { Range } from "metabase/visualizations/shared/types/scale";
import type { VisualizationSettings } from "metabase-types/api";

export const getLabelledSeries = <TDatum>(
  settings: VisualizationSettings,
  series: Series<TDatum>[],
) => {
  const stackOffset = getStackOffset(settings);

  if (stackOffset === "expand") {
    return null;
  }

  return series
    .filter(series => {
      const showSeriesValuesSetting =
        settings?.series_settings?.[series.seriesKey]?.show_series_values;

      return (
        showSeriesValuesSetting ||
        (typeof showSeriesValuesSetting === "undefined" &&
          settings["graph.show_values"] === true)
      );
    })
    .map(series => series.seriesKey);
};

export const getAxesVisibility = (settings: VisualizationSettings) => {
  return {
    hasXAxis: !!(settings["graph.y_axis.axis_enabled"] ?? true),
    hasYAxis: !!(settings["graph.x_axis.axis_enabled"] ?? true),
  };
};

export const getXValueRange = (
  settings: VisualizationSettings,
): Range | undefined => {
  const isAutoRange = settings["graph.y_axis.auto_range"] ?? true;

  if (isAutoRange) {
    return undefined;
  }

  return [settings["graph.y_axis.min"] ?? 0, settings["graph.y_axis.max"] ?? 0];
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
