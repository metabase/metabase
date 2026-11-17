import type { MetricDimension } from "metabase-types/api";

export function formatDimensionLabel(dim: MetricDimension): string {
  return dim.display_name ?? dim.id;
}
