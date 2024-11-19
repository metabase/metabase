import type { NumberLike, StringLike } from "@visx/scale";

import { formatValue } from "metabase/lib/formatting";
import { getFormattingOptionsWithoutScaling } from "metabase/visualizations/echarts/cartesian/model/util";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import type {
  ChartTicksFormatters,
  ValueFormatter,
} from "metabase/visualizations/shared/types/format";
import { getLabelsMetricColumn } from "metabase/visualizations/shared/utils/series";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

export const getStaticFormatters = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ChartTicksFormatters => {
  const yTickFormatter = (value: StringLike) => {
    const column = chartColumns.dimension.column;
    const columnSettings = getColumnSettings(settings, column);

    const options = getFormattingOptionsWithoutScaling({
      column,
      ...columnSettings,
      jsx: false,
    });

    return String(formatValue(value, options));
  };

  const metricColumn = getLabelsMetricColumn(chartColumns);

  const percentXTicksFormatter = (percent: NumberLike) => {
    const column = metricColumn.column;
    const number_separators = getColumnSettings(
      settings,
      column,
    )?.number_separators;

    const options = getFormattingOptionsWithoutScaling({
      column,
      number_separators,
      jsx: false,
      number_style: "percent",
      decimals: 2,
    });

    return String(formatValue(percent, options));
  };

  const xTickFormatter = (value: NumberLike) => {
    const column = metricColumn.column;
    const columnSettings = getColumnSettings(settings, column);

    const options = getFormattingOptionsWithoutScaling({
      column,
      ...columnSettings,
      jsx: false,
    });

    return String(formatValue(value, options));
  };

  const shouldFormatXTicksAsPercent = getStackOffset(settings) === "expand";

  return {
    yTickFormatter,
    xTickFormatter: shouldFormatXTicksAsPercent
      ? percentXTicksFormatter
      : xTickFormatter,
  };
};

export const getLabelsStaticFormatter = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ValueFormatter => {
  const column = getLabelsMetricColumn(chartColumns).column;
  const columnSettings = getColumnSettings(settings, column);
  const options = getFormattingOptionsWithoutScaling({
    column,
    ...columnSettings,
    jsx: false,
    compact: settings["graph.label_value_formatting"] === "compact",
  });

  const labelsFormatter = (value: any) => String(formatValue(value, options));

  return labelsFormatter;
};

export const getColumnValueStaticFormatter = () => {
  return (value: RowValue, column: DatasetColumn) => {
    return String(formatValue(value, { column }));
  };
};
