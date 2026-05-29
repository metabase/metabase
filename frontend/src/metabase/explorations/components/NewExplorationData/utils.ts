import { t } from "ttag";

import type { MetricDimension } from "metabase-types/api";

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

  const rows: DimensionListRow[] = [];
  for (const key of orderedKeys) {
    rows.push({
      type: "header",
      key,
      label: labels.get(key) ?? t`Other`,
      maxInterestingness: maxima.get(key) ?? 0,
    });
    for (const dimension of buckets.get(key) ?? []) {
      rows.push({ type: "dimension", key, dimension });
    }
  }
  return rows;
}
