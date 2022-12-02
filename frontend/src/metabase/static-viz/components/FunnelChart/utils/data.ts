import { RowValue, VisualizationSettings } from "metabase-types/api";
import { isNotNull } from "metabase/core/utils/types";
import {
  ColumnDescriptor,
  getColumnDescriptor,
} from "metabase/visualizations/lib/graph/columns";
import {
  MetricValue,
  TwoDimensionalChartData,
} from "metabase/visualizations/shared/types/data";
import { getMetricValue } from "metabase/visualizations/shared/utils/data";

export type FunnelChartColumns = {
  dimension: ColumnDescriptor;
  metric: ColumnDescriptor;
};

export const getFunnelColumns = (
  data: TwoDimensionalChartData,
  settings: VisualizationSettings,
): FunnelChartColumns => {
  const dimensionColumName = settings["funnel.dimension"];
  const metricColumnName = settings["funnel.metric"];

  const dimension: ColumnDescriptor =
    dimensionColumName != null
      ? getColumnDescriptor(dimensionColumName, data.cols)
      : {
          column: data.cols[0],
          index: 0,
        };

  const metric: ColumnDescriptor =
    metricColumnName != null
      ? getColumnDescriptor(metricColumnName, data.cols)
      : {
          column: data.cols[1],
          index: 1,
        };

  return {
    dimension,
    metric,
  };
};

export type FunnelDatum = {
  dimension: RowValue;
  metric: MetricValue;
};

export const getFunnelData = (
  data: TwoDimensionalChartData,
  funnelColums: FunnelChartColumns,
): FunnelDatum[] => {
  return data.rows.map(row => {
    return {
      dimension: row[funnelColums.dimension.index],
      metric: getMetricValue(row[funnelColums.metric.index]),
    };
  });
};

export const sortFunnelData = (
  data: FunnelDatum[],
  settings: VisualizationSettings,
  dimensionFormatter: (value: unknown) => string,
): FunnelDatum[] => {
  const funnelOrder = settings["funnel.rows"];
  if (funnelOrder == null) {
    return data;
  }

  return funnelOrder
    .filter(row => row.enabled)
    .map(row => {
      const datum = data.find(
        datum => dimensionFormatter(datum.dimension) === row.key,
      );
      return datum;
    })
    .filter(isNotNull);
};
