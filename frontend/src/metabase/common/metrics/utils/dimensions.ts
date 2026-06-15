import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

export function getDimensionIcon(
  dimension: LibMetric.DimensionMetadata,
): IconName {
  // semantic type checks first
  if (LibMetric.isPrimaryKey(dimension)) {
    return "label";
  }
  if (LibMetric.isForeignKey(dimension)) {
    return "connections";
  }
  if (
    LibMetric.isLocation(dimension) ||
    LibMetric.isLatitude(dimension) ||
    LibMetric.isLongitude(dimension)
  ) {
    return "location";
  }

  // effective type checks next
  if (LibMetric.isTemporal(dimension)) {
    return "calendar";
  }
  if (LibMetric.isBoolean(dimension)) {
    return "io";
  }
  if (LibMetric.isStringOrStringLike(dimension)) {
    return "string";
  }
  if (LibMetric.isNumeric(dimension)) {
    return "int";
  }

  return "list";
}
