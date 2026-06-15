import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

export function getDimensionIcon(dimension: DimensionMetadata): IconName {
  if (LibMetric.isPrimaryKey(dimension)) {
    return "label";
  }
  if (LibMetric.isForeignKey(dimension)) {
    return "connections";
  }
  if (LibMetric.isBoolean(dimension)) {
    return "io";
  }
  if (LibMetric.isDateOrDateTime(dimension) || LibMetric.isTime(dimension)) {
    return "calendar";
  }
  if (
    LibMetric.isState(dimension) ||
    LibMetric.isCountry(dimension) ||
    LibMetric.isCity(dimension) ||
    LibMetric.isLocation(dimension) ||
    LibMetric.isCoordinate(dimension)
  ) {
    return "location";
  }
  if (
    LibMetric.isCategory(dimension) ||
    LibMetric.isStringOrStringLike(dimension)
  ) {
    return "label";
  }
  if (LibMetric.isNumeric(dimension)) {
    return "int";
  }
  return "unknown";
}
