import type { DatasetColumn } from "metabase-types/api";

export interface RadarColumns {
  dimension: DatasetColumn;
  metrics: DatasetColumn[];
}

export interface RadarDataPoint {
  dimensionValue: any;
  rawDimensionValue: any;
  metricValues: (number | null)[];
}

export interface RadarSeriesData {
  metricName: string;
  metricColumn: DatasetColumn;
  values: (number | null)[];
}

export interface RadarData {
  indicators: {
    name: string;
    rawName: any;
    max?: number;
    min?: number;
  }[];
  series: RadarSeriesData[];
}

export interface RadarFormatters {
  dimension: (value: any) => string;
  metrics: ((value: number) => string)[];
}

export interface RadarChartModel {
  data: RadarData;
  formatters: RadarFormatters;
  radarColumns: RadarColumns | null;
}