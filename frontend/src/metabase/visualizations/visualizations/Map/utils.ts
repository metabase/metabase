import {
  hasLatitudeAndLongitudeColumns,
  isMetric,
  isNumeric,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

export const PIN_MAP_VALUES = ["pin", "heat", "grid"] as const;
export type PinMapValue = (typeof PIN_MAP_VALUES)[number];

export function isPinMapType(value: unknown): value is PinMapValue {
  return PIN_MAP_VALUES.some((v) => v === value);
}

const isValidCoordinatesColumn = (column: DatasetColumn | undefined) =>
  !!column &&
  (column.binning_info != null ||
    (column.source === "native" && isNumeric(column)));

// Leaflet-free equivalent of `PinMap.isSensible || ChoroplethMap.isSensible ||
// LeafletGridHeatMap.isSensible`. Kept here (rather than reaching into those
// leaflet-importing components) so the Map visualization definition can decide
// whether a dataset is map-able without pulling leaflet into the initial bundle.
export function isMapSensible({ cols }: DatasetData): boolean {
  const isPinMapSensible = hasLatitudeAndLongitudeColumns(cols);
  const isRegionMapSensible =
    cols.filter(isString).length > 0 && cols.filter(isMetric).length > 0;
  const isGridMapSensible =
    cols.filter(isValidCoordinatesColumn).length >= 2 &&
    cols.filter(isMetric).length > 0;

  return isPinMapSensible || isRegionMapSensible || isGridMapSensible;
}
