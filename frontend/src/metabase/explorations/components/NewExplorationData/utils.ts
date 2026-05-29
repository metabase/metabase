import { t } from "ttag";

import type { MetricDimension } from "metabase-types/api";

/**
 * Section key in the grouped dimension list: the dimension's source
 * `group.id` (typically a stringified table id), or `null` when the
 * dimension carries no group at all. We keep `null` as a first-class
 * bucket so dimensions without a source still render in a dedicated
 * "Other" section instead of mixing with a real source.
 */
export type DimensionGroupSourceKey = string | null;

export interface DimensionListHeaderRow {
  type: "header";
  key: DimensionGroupSourceKey;
  /** Section title — the source's `group.display_name` (or "Other"). */
  label: string;
  /**
   * The highest `dimension_interestingness` among the section's
   * dimensions (null treated as 0). Sections are ordered by this value
   * descending, so the section holding the single most interesting
   * dimension always floats to the top.
   */
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

/**
 * Group `dimensions` by their source — i.e., their `group.id` (table /
 * source). Section headers are the source's `display_name`. Section
 * order is by the *maximum* `dimension_interestingness` among each
 * section's dimensions (descending; null is treated as 0), so the
 * section containing the single most interesting dimension comes first.
 * The relative order of dimensions inside each section is preserved —
 * callers should pass dimensions already sorted by interestingness desc,
 * which is what the `/api/exploration/dimensions` endpoint returns.
 *
 * The result is a flat `[header, ...dims, header, ...dims]` list ready
 * to feed a single virtualizer.
 *
 * This replaces the earlier coarse-semantic-type bucketing — it
 * matches how the metrics viewer's dimension picker (see
 * `metabase/metrics-viewer/utils/dimension-picker.ts`) groups, so
 * users see consistent source-based sections across the product.
 */
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
