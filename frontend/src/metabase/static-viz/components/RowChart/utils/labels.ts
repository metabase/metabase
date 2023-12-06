import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { VisualizationSettings } from "metabase-types/api";

// Uses inverse axis settings to have settings compatibility between line/area/bar/combo and row charts
export const getChartLabels = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
) => {
  const defaultXLabel =
    "breakout" in chartColumns ? chartColumns.metric.column.display_name : "";
  const xLabelValue = settings["graph.y_axis.title_text"] ?? defaultXLabel;

  const xLabel =
    (settings["graph.y_axis.labels_enabled"] ?? true) && xLabelValue.length > 0
      ? xLabelValue
      : undefined;

  const defaultYLabel =
    "breakout" in chartColumns
      ? ""
      : chartColumns.dimension.column.display_name;
  const yLabelValue = settings["graph.x_axis.title_text"] ?? defaultYLabel;
  const yLabel =
    (settings["graph.x_axis.labels_enabled"] ?? true) &&
    (yLabelValue.length ?? 0) > 0
      ? yLabelValue
      : undefined;

  return {
    xLabel,
    yLabel,
  };
};
