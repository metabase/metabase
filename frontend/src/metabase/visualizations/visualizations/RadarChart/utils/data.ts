import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

import { getColumnCardinality } from "metabase/visualizations/lib/utils";

const RADAR_SENSIBLE_MIN_METRICS = 2;
const RADAR_SENSIBLE_MAX_DIMENSION_CARDINALITY = 30;
const RADAR_SENSIBLE_MIN_DIMENSION_CARDINALITY = 3;

export function findSensibleRadarColumns(data: DatasetData): {
  dimension: string;
  metrics: string[];
} | null {
  if (!data?.cols || !data?.rows) {
    return null;
  }

  const { cols, rows } = data;

  // Find all metric columns
  const metricColumns = cols.filter(isMetric);
  if (metricColumns.length < RADAR_SENSIBLE_MIN_METRICS) {
    return null;
  }

  // Find suitable dimension column
  const dimensionColumn = cols.find((col, index) => {
    if (!isDimension(col)) {
      return false;
    }

    const cardinality = getColumnCardinality(cols, rows, index);
    return (
      cardinality >= RADAR_SENSIBLE_MIN_DIMENSION_CARDINALITY &&
      cardinality <= RADAR_SENSIBLE_MAX_DIMENSION_CARDINALITY
    );
  });

  if (!dimensionColumn) {
    return null;
  }

  // Return the first suitable dimension and up to 5 metrics
  return {
    dimension: dimensionColumn.name,
    metrics: metricColumns.slice(0, 5).map((col) => col.name),
  };
}