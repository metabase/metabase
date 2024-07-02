import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import type {
  DatasetData,
  VisualizationSettings,
  DatasetColumn,
} from "metabase-types/api";

export type ColumnDescriptor = {
  index: number;
  column: RemappingHydratedDatasetColumn;
};

export const getColumnDescriptors = <TColumn extends DatasetColumn>(
  columnNames: string[],
  columns: TColumn[],
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
    .filter(isNotNull);

  const dimensionColumns = (visualizationSettings["graph.dimensions"] ?? [])
    .map(dimensionColumnName =>
      data.cols.find(column => column.name === dimensionColumnName),
    )
    .filter(isNotNull);

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

export type ScatterPlotColumns = (
  | BreakoutChartColumns
  | MultipleMetricsChartColumns
) & {
  bubbleSize?: ColumnDescriptor;
};

export type CartesianChartColumns =
  | BreakoutChartColumns
  | MultipleMetricsChartColumns
  | ScatterPlotColumns;

export function assertMultiMetricColumns(
  chartColumns: CartesianChartColumns,
): MultipleMetricsChartColumns {
  if ("breakout" in chartColumns) {
    throw Error("Given `chartColumns` has breakout");
  }

  return chartColumns;
}

export const getCartesianChartColumns = (
  columns: RemappingHydratedDatasetColumn[],
  settings: Pick<
    VisualizationSettings,
    "graph.dimensions" | "graph.metrics" | "scatter.bubble"
  >,
): CartesianChartColumns => {
  const [dimension, breakout] = getColumnDescriptors(
    (settings["graph.dimensions"] ?? []).filter(isNotNull),
    columns,
  );

  const metrics = getColumnDescriptors(
    _.uniq((settings["graph.metrics"] ?? []).filter(isNotNull)),
    columns,
  );

  const bubbleSize = getColumnDescriptors(
    [settings["scatter.bubble"]].filter(isNotNull),
    columns,
  )[0];

  if (breakout) {
    return {
      dimension,
      breakout,
      metric: metrics[0],
      bubbleSize,
    };
  }

  return {
    dimension,
    metrics,
    bubbleSize,
  };
};
