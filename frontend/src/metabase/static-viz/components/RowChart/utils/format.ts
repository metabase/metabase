import { RowValue, VisualizationSettings } from "metabase-types/api";
import { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import { formatNumber, formatPercent } from "metabase/static-viz/lib/numbers";
import { ChartTicksFormatters } from "metabase/visualizations/shared/types/format";

export const getXValueMetricColumn = (chartColumns: ChartColumns) => {
  // For multi-metrics charts we use the first metic column settings for formatting
  return "breakout" in chartColumns
    ? chartColumns.metric
    : chartColumns.metrics[0];
};

export const getStaticFormatters = (
  chartColumns: ChartColumns,
  settings: VisualizationSettings,
): ChartTicksFormatters => {
  // TODO: implement formatter
  const yTickFormatter = (value: RowValue) => {
    return String(value);
  };

  const metricColumnSettings =
    settings.column_settings?.[getXValueMetricColumn(chartColumns).column.name];

  const xTickFormatter = (value: any) =>
    formatNumber(value, metricColumnSettings);

  const shouldFormatXTicksAsPercent = getStackOffset(settings) === "expand";

  return {
    yTickFormatter,
    xTickFormatter: shouldFormatXTicksAsPercent
      ? formatPercent
      : xTickFormatter,
  };
};

// TODO: implement formatter
export const getStaticColumnValueFormatter = () => {
  return (value: any) => String(value);
};

// TODO: implement formatter
export const getLabelsFormatter = () => {
  return (value: any) => formatNumber(value);
};
