import { t } from "ttag";

import { COORDINATE, LOCATION } from "metabase-lib/v1/types/constants";
import {
  isBoolean,
  isCategory,
  isDate,
  isFieldType,
  isNumeric,
  isString,
  isStringLike,
} from "metabase-lib/v1/types/utils/isa";
import type {
  ExplorationDimensionGroup,
  MetricDimension,
} from "metabase-types/api";

export type DimensionTypeKey =
  | "date"
  | "geolocation"
  | "category"
  | "number"
  | "other";

export const DIMENSION_TYPE_ORDER: DimensionTypeKey[] = [
  "date",
  "geolocation",
  "category",
  "number",
  "other",
];

export function getDimensionTypeKey(
  dimension: MetricDimension,
): DimensionTypeKey {
  if (isDate(dimension)) {
    return "date";
  }
  if (isFieldType(LOCATION, dimension) || isFieldType(COORDINATE, dimension)) {
    return "geolocation";
  }
  if (
    isCategory(dimension) ||
    isString(dimension) ||
    isStringLike(dimension) ||
    isBoolean(dimension)
  ) {
    return "category";
  }
  if (isNumeric(dimension)) {
    return "number";
  }
  return "other";
}

export function getDimensionTypeLabel(key: DimensionTypeKey): string {
  switch (key) {
    case "date":
      return t`Date`;
    case "geolocation":
      return t`Geo`;
    case "category":
      return t`Category`;
    case "number":
      return t`Numeric`;
    case "other":
      return t`Other`;
  }
}

// `/api/exploration/dimensions` matches metrics by name OR dimension, then
// returns *every* dimension of each matching metric — so a dimension search
// drags along the metric's other dimensions. Re-filter client-side.
export function filterDimensionGroupsBySearch(
  groups: ExplorationDimensionGroup[],
  query: string,
): ExplorationDimensionGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return groups;
  }

  const matches = (value: string | null | undefined) =>
    value != null && value.toLowerCase().includes(normalizedQuery);

  return groups.filter(
    (group) =>
      matches(group.name) ||
      group.dimensions.some(
        (dimension) =>
          matches(dimension.display_name) ||
          matches(dimension.group?.display_name),
      ),
  );
}

export function formatDimensionLabel(dim: MetricDimension): string {
  return dim.display_name ?? dim.id;
}
