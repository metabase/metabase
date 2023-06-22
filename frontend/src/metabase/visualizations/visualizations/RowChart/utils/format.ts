import { NumberLike, StringLike } from "@visx/scale";
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
import { getLabelsMetricColumn } from "metabase/visualizations/shared/utils/series";
import { formatValue } from "metabase/lib/formatting";

export const getFormatters = (
  chartColumns: ChartColumns,
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
  chartColumns: ChartColumns,
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
    String(formatValue(value, { column }));
};
