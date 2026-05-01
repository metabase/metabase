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
import type { MetricDimension } from "metabase-types/api";

export type DimensionGroupKey =
  | "date"
  | "geolocation"
  | "category"
  | "number"
  | "other";

/**
 * Bucket a dimension into a coarse, user-facing semantic group.
 *
 * The buckets are deliberately coarser than `effective_type` / `semantic_type`
 * so the picker UI surfaces them with familiar labels ("Date", "Geolocation",
 * "Category", "Number") rather than the underlying type literals. Order
 * matters — we check the most specific signals first (date, geolocation)
 * before falling back to the broader buckets.
 */
export function getDimensionGroupKey(
  dimension: MetricDimension,
): DimensionGroupKey {
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

export function getDimensionGroupLabel(key: DimensionGroupKey): string {
  switch (key) {
    case "date":
      return t`Date`;
    case "geolocation":
      return t`Geolocation`;
    case "category":
      return t`Category`;
    case "number":
      return t`Number`;
    case "other":
      return t`Other`;
  }
}

export interface DimensionListHeaderRow {
  type: "header";
  key: DimensionGroupKey;
  label: string;
  averageInterestingness: number;
}

export interface DimensionListItemRow {
  type: "dimension";
  key: DimensionGroupKey;
  dimension: MetricDimension;
}

export type DimensionListRow = DimensionListHeaderRow | DimensionListItemRow;

/**
 * Group `dimensions` by coarse semantic type, ordering groups by their average
 * `dimension_interestingness` (descending; null is treated as 0). The relative
 * order of dimensions inside each group is preserved — callers should pass
 * dimensions already sorted by interestingness desc, which is what the
 * `/api/exploration/dimensions` endpoint returns.
 *
 * The result is a flat `[header, ...dims, header, ...dims]` list ready to feed
 * a single virtualizer.
 */
export function groupDimensionsBySemanticType(
  dimensions: MetricDimension[],
): DimensionListRow[] {
  if (dimensions.length === 0) {
    return [];
  }

  const buckets = new Map<DimensionGroupKey, MetricDimension[]>();
  for (const dimension of dimensions) {
    const key = getDimensionGroupKey(dimension);
    const list = buckets.get(key);
    if (list) {
      list.push(dimension);
    } else {
      buckets.set(key, [dimension]);
    }
  }

  const averageInterestingness = (dims: MetricDimension[]) => {
    if (dims.length === 0) {
      return 0;
    }
    const sum = dims.reduce(
      (acc, dim) => acc + (dim.dimension_interestingness ?? 0),
      0,
    );
    return sum / dims.length;
  };

  const averages = new Map<DimensionGroupKey, number>(
    [...buckets.entries()].map(([key, dims]) => [
      key,
      averageInterestingness(dims),
    ]),
  );

  const orderedKeys = [...buckets.keys()].sort(
    (a, b) => (averages.get(b) ?? 0) - (averages.get(a) ?? 0),
  );

  const rows: DimensionListRow[] = [];
  for (const key of orderedKeys) {
    rows.push({
      type: "header",
      key,
      label: getDimensionGroupLabel(key),
      averageInterestingness: averages.get(key) ?? 0,
    });
    for (const dimension of buckets.get(key) ?? []) {
      rows.push({ type: "dimension", key, dimension });
    }
  }
  return rows;
}
