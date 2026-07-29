import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type { IconName, MetricDimension } from "metabase-types/api";

export function getDimensionIcon(
  dimension: LibMetric.DimensionMetadata | MetricDimension,
): IconName {
  if ("display_name" in dimension) {
    return getColumnIcon(
      Lib.legacyColumnTypeInfo({
        effective_type: dimension.effective_type,
        semantic_type: dimension.semantic_type,
      }),
    );
  }

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
