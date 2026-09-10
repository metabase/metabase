import type { DimensionType } from "metabase/common/metrics/utils/dimension-types";
import type { IconName } from "metabase-types/api";

const DIMENSION_TYPE_ICONS: Record<DimensionType, IconName> = {
  time: "calendar",
  geo: "location",
  category: "string",
  boolean: "io",
  numeric: "int",
};

export function getDimensionTypeIcon(type: DimensionType): IconName {
  return DIMENSION_TYPE_ICONS[type];
}
