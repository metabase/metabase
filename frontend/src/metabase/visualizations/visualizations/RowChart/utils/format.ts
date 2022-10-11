import {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { formatValue } from "metabase/lib/formatting";
import {
  ChartTicksFormatters,
  ColumnFormatter,
  ValueFormatter,
} from "metabase/visualizations/shared/types/format";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";

const getXValueMetricColumn = (
  chartColumns: ChartColumns,
  settings: VisualizationSettings,
) => {
  // For multi-metrics charts we use the first metic column settings for formatting
  return "breakout" in chartColumns
    ? chartColumns.metric
    : chartColumns.metrics[0];
};

export const getFormatters = (
  chartColumns: ChartColumns,
  settings: VisualizationSettings,
): ChartTicksFormatters => {
  const yTickFormatter = (value: RowValue) => {
    return String(
      formatValue(value, {
        ...settings.column(chartColumns.dimension.column),
        jsx: false,
      }),
    );
  };

  const metricColumn = getXValueMetricColumn(chartColumns, settings);

  const percentXTicksFormatter = (percent: any) =>
    String(
      formatValue(percent, {
        column: metricColumn.column,
        number_separators: settings.column(metricColumn.column)
          .number_separators,
        jsx: false,
        number_style: "percent",
        decimals: 2,
      }),
    );

  const xTickFormatter = (value: any) =>
    String(
      formatValue(value, {
        ...settings.column(metricColumn.column),
        jsx: false,
      }),
    );

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
): ValueFormatter => {
  const metricColumn = getXValueMetricColumn(chartColumns, settings);

  const labelsFormatter = (value: any) =>
    String(
      formatValue(value, {
        ...settings.column(metricColumn.column),
        jsx: false,
        compact: settings["graph.label_value_formatting"] === "compact",
      }),
    );

  return labelsFormatter;
};

export const formatColumnValue: ColumnFormatter = (
  value: any,
  column: DatasetColumn,
) => String(formatValue(value, { column }));
