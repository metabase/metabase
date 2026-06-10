import * as Lib from "metabase-lib";
import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

export function getColumnIcon(
  column: Lib.ColumnMetadata | Lib.ColumnTypeInfo,
): IconName {
  if (Lib.isPrimaryKey(column)) {
    return "label";
  }
  if (Lib.isForeignKey(column)) {
    return "connections";
  }

  if (
    Lib.isLocation(column) ||
    Lib.isLatitude(column) ||
    Lib.isLongitude(column)
  ) {
    return "location";
  }

  if (Lib.isTemporal(column)) {
    return "calendar";
  }

  // Wide type checks should go last,
  // as PK/FK/Location/Date, etc. are also strings, numbers, etc.
  if (Lib.isBoolean(column)) {
    return "io";
  }
  if (Lib.isStringOrStringLike(column)) {
    return "string";
  }
  if (Lib.isNumeric(column)) {
    return "int";
  }

  return "list";
}

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
