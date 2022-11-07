import {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import {
  ChartTicksFormatters,
  ValueFormatter,
} from "metabase/visualizations/shared/types/format";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";

export const getXValueMetricColumn = (chartColumns: ChartColumns) => {
  // For multi-metrics charts we use the first metic column settings for formatting
  return "breakout" in chartColumns
    ? chartColumns.metric
    : chartColumns.metrics[0];
};

export const getFormatters = (
  chartColumns: ChartColumns,
  settings: VisualizationSettings,
  formatValue: any,
): ChartTicksFormatters => {
  const yTickFormatter = (value: RowValue) => {
    return String(
      formatValue(value, {
        ...settings.column(chartColumns.dimension.column),
        jsx: false,
      }),
    );
  };

  const metricColumn = getXValueMetricColumn(chartColumns);

  const percentXTicksFormatter = (percent: any) => {
    const column = metricColumn.column;
    const number_separators = settings.column(column)?.number_separators;

    return String(
      formatValue(percent, {
        column,
        number_separators,
        jsx: false,
        number_style: "percent",
        decimals: 2,
      }),
    );
  };

  const xTickFormatter = (value: any) => {
    return String(
      formatValue(value, {
        ...settings.column(metricColumn.column),
        jsx: false,
      }),
    );
  };

  const shouldFormatXTicksAsPercent = getStackOffset(settings) === "expand";

  return {
    yTickFormatter,
    xTickFormatter: shouldFormatXTicksAsPercent
      ? percentXTicksFormatter
      : xTickFormatter,
  };
};

export const getLabelsFormatter = (
  chartColumns: ChartColumns,
  settings: VisualizationSettings,
  formatValue: any,
): ValueFormatter => {
  const column = getXValueMetricColumn(chartColumns).column;

  const labelsFormatter = (value: any) =>
    String(
      formatValue(value, {
        ...settings.column(column),
        jsx: false,
        compact: settings["graph.label_value_formatting"] === "compact",
      }),
    );

  return labelsFormatter;
};

export const getColumnValueFormatter = (formatValue: any) => {
  return (value: any, column: DatasetColumn) =>
    String(formatValue(value, { column }));
};
