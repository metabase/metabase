import {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";
import { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { Series } from "metabase/visualizations/shared/components/RowChart/types";
import {
  GroupedDataset,
  GroupedDatum,
  MetricDatum,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";

const getMetricColumnData = (
  columns: DatasetColumn[],
  metricDatum: MetricDatum,
) => {
  return Object.entries(metricDatum).map(([columnName, value]) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const col = columns.find(column => column.name === columnName)!;

    return {
      key: col.display_name,
      value,
      col,
    };
  });
};

const getColumnsData = (
  chartColumns: ChartColumns,
  series: Series<GroupedDatum, unknown>,
  datum: GroupedDatum,
  datasetColumns: DatasetColumn[],
) => {
  const data = [
    {
      key: chartColumns.dimension.column.display_name,
      value: datum.dimensionValue,
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

    metricDatum = datum.breakout[series.seriesKey];
  } else {
    metricDatum = datum.metrics;
  }

  data.push(...getMetricColumnData(datasetColumns, metricDatum));
  return data;
};

export const getClickData = (
  seriesIndex: number,
  datumIndex: number,
  series: Series<GroupedDatum, SeriesInfo>[],
  groupedData: GroupedDataset,
  visualizationSettings: VisualizationSettings,
  chartColumns: ChartColumns,
  datasetColumns: DatasetColumn[],
) => {
  const currentSeries = series[seriesIndex];
  const currentDatum = groupedData[datumIndex];
  const data = getColumnsData(
    chartColumns,
    currentSeries,
    currentDatum,
    datasetColumns,
  );

  const xValue = currentSeries.xAccessor(currentDatum);
  const yValue = currentSeries.yAccessor(currentDatum);

  const dimensions: { column: DatasetColumn; value?: RowValue }[] = [
    {
      column: chartColumns.dimension.column,
      value: yValue,
    },
  ];

  if ("breakout" in chartColumns) {
    dimensions.push({
      column: chartColumns.breakout.column,
      value: currentSeries.seriesInfo?.breakoutValue,
    });
  }

  return {
    value: xValue,
    column: currentSeries.seriesInfo?.metricColumn,
    dimensions,
    data,
    settings: visualizationSettings,
  };
};

export const getLegendClickData = (
  seriesIndex: number,
  series: Series<GroupedDatum, SeriesInfo>[],
  visualizationSettings: VisualizationSettings,
  chartColumns: ChartColumns,
) => {
  const currentSeries = series[seriesIndex];

  const dimensions =
    "breakout" in chartColumns
      ? {
          column: chartColumns.breakout.column,
          value: currentSeries.seriesInfo?.breakoutValue,
        }
      : undefined;

  return {
    column: currentSeries.seriesInfo?.metricColumn,
    dimensions,
    settings: visualizationSettings,
  };
};

export const getHoverData = (
  seriesIndex: number,
  datumIndex: number,
  series: Series<GroupedDatum, SeriesInfo>[],
  groupedData: GroupedDataset,
  settings: VisualizationSettings,
  chartColumns: ChartColumns,
  datasetColumns: DatasetColumn[],
) => {
  const currentSeries = series[seriesIndex];
  const currentDatum = groupedData[datumIndex];
  const data = getColumnsData(
    chartColumns,
    currentSeries,
    currentDatum,
    datasetColumns,
  );

  return {
    settings,
    datumIndex,
    index: seriesIndex,
    data,
  };
};
