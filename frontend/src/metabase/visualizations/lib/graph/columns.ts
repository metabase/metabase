import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";
import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

export type ColumnDescriptor = {
  index: number;
  column: RemappingHydratedDatasetColumn;
};

export const getColumnDescriptors = <TColumn extends DatasetColumn>(
  columnNames: string[],
  columns: TColumn[],
): ColumnDescriptor[] => {
  const result: ColumnDescriptor[] = [];

  columnNames.forEach((columnName) => {
    const index = columns.findIndex((column) => column.name === columnName);

    if (index > -1) {
      result.push({
        index,
        column: columns[index],
      });
    }
  });

  return result;
};

// Returns the subset of `cols` referenced by `graph.dimensions` or
// `graph.metrics` settings that successfully resolve in the dataset.
// In breakout shape (2 dimensions) only the first metric is rendered, so the
// remaining metrics stay available as additional columns.
export const getReferencedColumns = <TColumn extends DatasetColumn>(
  cols: TColumn[],
  settings: Pick<VisualizationSettings, "graph.dimensions" | "graph.metrics">,
): TColumn[] => {
  const dimensions = (settings["graph.dimensions"] ?? []).filter(isNotNull);
  const metrics = (settings["graph.metrics"] ?? []).filter(isNotNull);
  const referencedMetrics =
    dimensions.length >= 2 ? metrics.slice(0, 1) : metrics;
  return [...dimensions, ...referencedMetrics]
    .map((name) => cols.find((col) => col.name === name))
    .filter(isNotNull);
};

export const hasValidColumnsSelected = (
  visualizationSettings: VisualizationSettings,
  data: DatasetData,
) => {
  const metricColumns = (visualizationSettings["graph.metrics"] ?? [])
    .map((metricColumnName) =>
      data.cols.find((column) => column.name === metricColumnName),
    )
    .filter(isNotNull);

  const dimensionColumns = (visualizationSettings["graph.dimensions"] ?? [])
    .map((dimensionColumnName) =>
      data.cols.find((column) => column.name === dimensionColumnName),
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
