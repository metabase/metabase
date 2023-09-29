import type { NumberLike, StringLike } from "@visx/scale";
import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  ChartTicksFormatters,
  ValueFormatter,
} from "metabase/visualizations/shared/types/format";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import { getLabelsMetricColumn } from "metabase/visualizations/shared/utils/series";
import { formatValue } from "metabase/lib/formatting";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isEmpty } from "metabase/lib/validate";

export const getFormatters = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ChartTicksFormatters => {
  const yTickFormatter = (value: StringLike) => {
    return String(
      formatValue(value, {
        ...settings.column(chartColumns.dimension.column),
        jsx: false,
      }),
    );
  };

  const metricColumn = getLabelsMetricColumn(chartColumns);

  const percentXTicksFormatter = (percent: NumberLike) => {
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

  const xTickFormatter = (value: NumberLike) => {
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
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ValueFormatter => {
  const column = getLabelsMetricColumn(chartColumns).column;

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

export const getColumnValueFormatter = () => {
  return (value: RowValue, column: DatasetColumn) =>
    isEmpty(value)
      ? NULL_DISPLAY_VALUE
      : String(formatValue(value, { column }));
};
