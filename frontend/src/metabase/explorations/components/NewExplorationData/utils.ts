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

export type DimensionGroupSourceKey = string | null;

export interface DimensionListHeaderRow {
  type: "header";
  key: DimensionGroupSourceKey;
  label: string;
  maxInterestingness: number;
}

export interface DimensionListItemRow {
  type: "dimension";
  key: DimensionGroupSourceKey;
  dimension: MetricDimension;
}

export type DimensionListRow = DimensionListHeaderRow | DimensionListItemRow;

function dimensionGroupSourceKey(
  dimension: MetricDimension,
): DimensionGroupSourceKey {
  return dimension.group?.id != null ? String(dimension.group.id) : null;
}

function dimensionGroupSourceLabel(dimension: MetricDimension): string {
  return dimension.group?.display_name ?? t`Other`;
}

export function groupDimensionsByGroupSource(
  dimensions: MetricDimension[],
): DimensionListRow[] {
  if (dimensions.length === 0) {
    return [];
  }

  const buckets = new Map<DimensionGroupSourceKey, MetricDimension[]>();
  const labels = new Map<DimensionGroupSourceKey, string>();
  for (const dimension of dimensions) {
    const key = dimensionGroupSourceKey(dimension);
    const list = buckets.get(key);
    if (list) {
      list.push(dimension);
    } else {
      buckets.set(key, [dimension]);
      labels.set(key, dimensionGroupSourceLabel(dimension));
    }
  }

  const maxInterestingness = (dims: MetricDimension[]) =>
    dims.reduce(
      (max, dim) => Math.max(max, dim.dimension_interestingness ?? 0),
      0,
    );

  const maxima = new Map<DimensionGroupSourceKey, number>(
    [...buckets.entries()].map(([key, dims]) => [
      key,
      maxInterestingness(dims),
    ]),
  );

  const orderedKeys = [...buckets.keys()].sort(
    (a, b) => (maxima.get(b) ?? 0) - (maxima.get(a) ?? 0),
  );

  const byInterestingnessDesc = (a: MetricDimension, b: MetricDimension) =>
    (b.dimension_interestingness ?? 0) - (a.dimension_interestingness ?? 0);

  const rows: DimensionListRow[] = [];
  for (const key of orderedKeys) {
    rows.push({
      type: "header",
      key,
      label: labels.get(key) ?? t`Other`,
      maxInterestingness: maxima.get(key) ?? 0,
    });
    // Sort within the group by interestingness; groups themselves are
    // already ordered by their max interestingness above.
    for (const dimension of [...(buckets.get(key) ?? [])].sort(
      byInterestingnessDesc,
    )) {
      rows.push({ type: "dimension", key, dimension });
    }
  }
  return rows;
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
  const name = dim.display_name ?? dim.id;
  const tableName = dim.group?.display_name;
  // FIXME: actually we don't want to use tableName as dimension group. We should replace this with dimension metadata
  return tableName ? `${tableName} - ${name}` : name;
}
