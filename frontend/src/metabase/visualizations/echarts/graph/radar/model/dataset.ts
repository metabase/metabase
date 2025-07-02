import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RawSeries } from "metabase-types/api";

import type { RadarColumns, RadarData, RadarDataPoint } from "./types";

export function getRadarChartColumns(
  cols: DatasetColumn[],
  settings: ComputedVisualizationSettings,
): RadarColumns | null {
  const dimensionColumn = cols.find(
    (col) => col.name === settings["radar.dimension"],
  );

  if (!dimensionColumn) {
    return null;
  }

  const metricColumns = settings["radar.metrics"]
    ?.map((metricName: string) =>
      cols.find((col: DatasetColumn) => col.name === metricName),
    )
    .filter((col): col is DatasetColumn => col != null && isMetric(col));

  if (!metricColumns || metricColumns.length < 2) {
    return null;
  }

  return {
    dimension: dimensionColumn,
    metrics: metricColumns,
  };
}

export function getRadarData(
  rawSeries: RawSeries,
  radarColumns: RadarColumns,
): RadarData {
  const [{ data }] = rawSeries;
  const { rows, cols } = data;

  const dimensionIndex = cols.findIndex(
    (col) => col.name === radarColumns.dimension.name,
  );
  const metricIndices = radarColumns.metrics.map((metric) =>
    cols.findIndex((col) => col.name === metric.name),
  );

  // Group data by dimension value
  const dataByDimension = new Map<any, RadarDataPoint>();

  rows.forEach((row) => {
    const dimensionValue = row[dimensionIndex];
    const metricValues = metricIndices.map((index) => {
      const value = row[index];
      return typeof value === "number" ? value : null;
    });

    dataByDimension.set(dimensionValue, {
      dimensionValue,
      rawDimensionValue: dimensionValue,
      metricValues,
    });
  });

  // Convert to arrays
  const indicators = Array.from(dataByDimension.entries()).map(
    ([rawName, dataPoint]) => {
      // Calculate max value across all metrics for this indicator
      const allValues = dataPoint.metricValues.filter(
        (v): v is number => v !== null,
      );
      const max = allValues.length > 0 ? Math.max(...allValues) * 1.2 : 100;

      return {
        name: String(dataPoint.dimensionValue),
        rawName,
        max,
        min: 0,
      };
    },
  );

  // Create series data for each metric
  const series = radarColumns.metrics.map((metricColumn, metricIndex) => {
    const values = Array.from(dataByDimension.values()).map(
      (dataPoint) => dataPoint.metricValues[metricIndex],
    );

    return {
      metricName: metricColumn.display_name || metricColumn.name,
      metricColumn,
      values,
    };
  });

  return {
    indicators,
    series,
  };
}
