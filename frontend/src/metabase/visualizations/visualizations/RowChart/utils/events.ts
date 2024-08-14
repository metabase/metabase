import { getIn } from "icepick";
import _ from "underscore";

import { formatNullable } from "metabase/lib/formatting/nullable";
import { isNotNull } from "metabase/lib/types";
import { sumMetric } from "metabase/visualizations/lib/dataset";
import type {
  CartesianChartColumns,
  ColumnDescriptor,
} from "metabase/visualizations/lib/graph/columns";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import { formatValueForTooltip } from "metabase/visualizations/lib/tooltip";
import type {
  BarData,
  Series,
} from "metabase/visualizations/shared/components/RowChart/types";
import type {
  GroupedDatum,
  MetricDatum,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import type {
  DataPoint,
  StackedTooltipModel,
  TooltipRowModel,
} from "metabase/visualizations/types";
import type {
  ClickObject,
  ClickObjectDimension,
} from "metabase-lib/v1/queries/drills/types";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

const getMetricColumnData = (
  columns: DatasetColumn[],
  metricDatum: MetricDatum,
  visualizationSettings: VisualizationSettings,
) => {
  return Object.entries(metricDatum).map(([columnName, value]) => {
    const col = columns.find(column => column.name === columnName)!;
    const key =
      getIn(visualizationSettings, ["series_settings", col.name, "title"]) ??
      col.display_name;

    return {
      key,
      value: formatNullable(value),
      col,
    };
  });
};

const getColumnData = (columns: ColumnDescriptor[], datum: GroupedDatum) => {
  return columns
    .map(columnDescriptor => {
      const { column, index } = columnDescriptor;

      let value;

      if (isMetric(column)) {
        const metricSum = datum.rawRows.reduce<number | null>(
          (acc, currentRow) => sumMetric(acc, currentRow[index]),
          null,
        );

        value = formatNullable(metricSum);
      } else {
        const distinctValues = new Set(datum.rawRows.map(row => row[index]));
        value = distinctValues.size === 1 ? datum.rawRows[0][index] : null;
      }

      return value != null
        ? {
            key: column.display_name,
            value: formatNullable(value),
            col: column,
          }
        : null;
    })
    .filter(isNotNull);
};

const getColumnsData = (
  chartColumns: CartesianChartColumns,
  series: Series<GroupedDatum, unknown>,
  datum: GroupedDatum,
  datasetColumns: DatasetColumn[],
  visualizationSettings: VisualizationSettings,
) => {
  const data = [
    {
      key: chartColumns.dimension.column.display_name,
      value: formatNullable(datum.dimensionValue),
      col: chartColumns.dimension.column,
    },
  ];

  let metricDatum: MetricDatum;

  if ("breakout" in chartColumns && datum.breakout) {
    data.push({
      key: chartColumns.breakout.column.display_name,
      value: series.seriesKey,
      col: chartColumns.breakout.column,
    });

    metricDatum = datum.breakout[series.seriesKey].metrics;
  } else {
    metricDatum = datum.metrics;
  }

  data.push(
    ...getMetricColumnData(datasetColumns, metricDatum, visualizationSettings),
  );

  const otherColumnsDescriptiors = getColumnDescriptors(
    datasetColumns
      .filter(column => !data.some(item => item.col === column))
      .map(column => column.name),
    datasetColumns,
  );

  data.push(...getColumnData(otherColumnsDescriptiors, datum));
  return data;
};

export const getClickData = (
  bar: BarData<GroupedDatum, SeriesInfo>,
  visualizationSettings: VisualizationSettings,
  chartColumns: CartesianChartColumns,
  datasetColumns: DatasetColumn[],
): ClickObject => {
  const { series, datum } = bar;
  const data = getColumnsData(
    chartColumns,
    series,
    datum,
    datasetColumns,
    visualizationSettings,
  );

  const xValue = series.xAccessor(datum);
  const yValue = series.yAccessor(datum);

  const dimensions: ClickObjectDimension[] = [
    {
      column: chartColumns.dimension.column,
      value: yValue,
    },
  ];

  if ("breakout" in chartColumns) {
    dimensions.push({
      column: chartColumns.breakout.column,
      value: series.seriesInfo?.breakoutValue ?? null,
    });
  }

  return {
    value: xValue,
    column: series.seriesInfo?.metricColumn,
    dimensions,
    data,
    settings: visualizationSettings,
  };
};

export const getLegendClickData = (
  seriesIndex: number,
  series: Series<GroupedDatum, SeriesInfo>[],
  visualizationSettings: VisualizationSettings,
  chartColumns: CartesianChartColumns,
) => {
  const currentSeries = series[seriesIndex];

  const dimensions =
    "breakout" in chartColumns
      ? [
          {
            column: chartColumns.breakout.column,
            value: currentSeries.seriesInfo?.breakoutValue ?? null,
          },
        ]
      : undefined;

  return {
    column: currentSeries.seriesInfo?.metricColumn,
    dimensions,
    settings: visualizationSettings,
  };
};

const getBreakoutsTooltipRows = <TDatum>(
  bar: BarData<TDatum>,
  settings: VisualizationSettings,
  multipleSeries: Series<TDatum, SeriesInfo>[],
  seriesColors: Record<string, string>,
): TooltipRowModel[] =>
  multipleSeries.map(series => {
    const value = series.xAccessor(bar.datum);
    return {
      name: series.seriesName,
      color: seriesColors[series.seriesKey],
      value,
      formatter: value =>
        String(
          formatValueForTooltip({
            value,
            settings,
            column: series.seriesInfo?.metricColumn,
          }),
        ),
    };
  });

export const getTooltipModel = <TDatum>(
  bar: BarData<TDatum>,
  settings: VisualizationSettings,
  chartColumns: CartesianChartColumns,
  multipleSeries: Series<TDatum, SeriesInfo>[],
  seriesColors: Record<string, string>,
) => {
  const { series, datum } = bar;
  const dimensionValue = series.yAccessor(datum);

  const headerTitle = String(
    formatValueForTooltip({
      value: dimensionValue,
      column: chartColumns.dimension.column,
      settings,
    }),
  );

  const hasBreakout = "breakout" in chartColumns;
  const rows = getBreakoutsTooltipRows(
    bar,
    settings,
    multipleSeries,
    seriesColors,
  );

  const [headerRows, bodyRows] = _.partition(
    rows,
    row => row.name === series.seriesName,
  );

  const totalFormatter = (value: unknown) =>
    String(
      formatValueForTooltip({
        value,
        settings,
        column: hasBreakout
          ? chartColumns.metric.column
          : chartColumns.metrics[0].column,
      }),
    );

  return {
    headerTitle,
    headerRows,
    bodyRows,
    totalFormatter,
    showTotal: true,
    showPercentages: true,
  };
};

export const getHoverData = (
  bar: BarData<GroupedDatum>,
  settings: VisualizationSettings,
  chartColumns: CartesianChartColumns,
  datasetColumns: DatasetColumn[],
  multipleSeries: Series<GroupedDatum, SeriesInfo>[],
  seriesColors: Record<string, string>,
): {
  settings: VisualizationSettings;
  datumIndex: number;
  index: number;
  data?: DataPoint[];
  stackedTooltipModel?: StackedTooltipModel;
} => {
  const hoverData = {
    settings,
    datumIndex: bar.datumIndex,
    index: bar.seriesIndex,
  };

  const hasMultipleSeries =
    "breakout" in chartColumns || chartColumns.metrics.length > 1;
  const isStacked = getStackOffset(settings) != null;
  if (!isStacked || !hasMultipleSeries) {
    const data = getColumnsData(
      chartColumns,
      bar.series,
      bar.datum,
      datasetColumns,
      settings,
    );

    return {
      ...hoverData,
      data,
    };
  }

  return {
    ...hoverData,
    stackedTooltipModel: getTooltipModel(
      bar,
      settings,
      chartColumns,
      multipleSeries,
      seriesColors,
    ),
  };
};
