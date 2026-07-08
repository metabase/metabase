import type { NumberLike, StringLike } from "@visx/scale";

import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { isEmpty } from "metabase/utils/validate";
import { getFormattingOptionsWithoutScaling } from "metabase/visualizations/echarts/cartesian/model/util";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import type { BarData } from "metabase/visualizations/shared/components/RowChart/types";
import type {
  GroupedDatum,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import type { ChartTicksFormatters } from "metabase/visualizations/shared/types/format";
import { getLabelsMetricColumn } from "metabase/visualizations/shared/utils/series";
import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

export const getFormatters = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ChartTicksFormatters => {
  const yTickFormatter = (value: StringLike) => {
    const options = getFormattingOptionsWithoutScaling({
      ...settings.column(chartColumns.dimension.column),
      jsx: false,
    });
    return String(formatValue(value, options));
  };

  const metricColumn = getLabelsMetricColumn(chartColumns);

  const percentXTicksFormatter = (percent: NumberLike) => {
    const column = metricColumn.column;
    const number_separators = settings.column(column)?.number_separators;
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
    const options = getFormattingOptionsWithoutScaling({
      ...settings.column(metricColumn.column),
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

export const getLabelsFormatter = (
  chartColumns: CartesianChartColumns,
  settings: VisualizationSettings,
): ((value: any, bar?: BarData<GroupedDatum, SeriesInfo>) => string) => {
  const fallbackColumn = getLabelsMetricColumn(chartColumns).column;

  const labelsFormatter = (
    value: any,
    bar?: BarData<GroupedDatum, SeriesInfo>,
  ) => {
    const column = bar?.series.seriesInfo?.metricColumn ?? fallbackColumn;
    const options = getFormattingOptionsWithoutScaling({
      ...settings.column(column),
      jsx: false,
      compact: settings["graph.label_value_formatting"] === "compact",
    });

    return String(formatValue(value, options));
  };

  return labelsFormatter;
};

export const getColumnValueFormatter = () => {
  return (value: RowValue, column: DatasetColumn) =>
    isEmpty(value)
      ? NULL_DISPLAY_VALUE
      : String(formatValue(value, { column }));
};
