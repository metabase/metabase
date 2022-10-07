import {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";
import { TwoDimensionalChartData } from "metabase/visualizations/shared/types/data";

export type ColumnDescriptor = {
  index: number;
  column: DatasetColumn;
};

export const getColumnDescriptors = (
  columnNames: string[],
  columns: DatasetColumn[],
): ColumnDescriptor[] => {
  return columnNames.map(columnName => {
    const index = columns.findIndex(column => column.name === columnName);

    return {
      index,
      column: columns[index],
    };
  });
};

export const hasValidColumnsSelected = (
  visualizationSettings: VisualizationSettings,
  data: DatasetData,
) => {
  const metricColumns = (visualizationSettings["graph.metrics"] ?? [])
    .map(metricColumnName =>
      data.cols.find(column => column.name === metricColumnName),
    )
    .filter(Boolean);

  const dimensionColumns = (visualizationSettings["graph.dimensions"] ?? [])
    .map(dimensionColumnName =>
      data.cols.find(column => column.name === dimensionColumnName),
    )
    .filter(Boolean);

  return metricColumns.length > 0 && dimensionColumns.length > 0;
};

export type BreakoutChartColumns = {
  dimension: ColumnDescriptor;
  breakout: ColumnDescriptor;
  metric: ColumnDescriptor;
};

export type MultipleMetricsChartColumns = {
  dimension: ColumnDescriptor;
  metrics: ColumnDescriptor[];
};

export type ChartColumns = BreakoutChartColumns | MultipleMetricsChartColumns;

export const getChartColumns = (
  data: TwoDimensionalChartData,
  visualizationSettings: VisualizationSettings,
): ChartColumns => {
  const [dimension, breakout] = getColumnDescriptors(
    visualizationSettings["graph.dimensions"] ?? [],
    data.cols,
  );

  const metrics = getColumnDescriptors(
    visualizationSettings["graph.metrics"] ?? [],
    data.cols,
  );

  if (breakout) {
    return {
      dimension,
      breakout,
      metric: metrics[0],
    };
  }

  return {
    dimension,
    metrics,
  };
};
