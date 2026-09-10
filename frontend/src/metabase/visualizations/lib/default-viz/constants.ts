import type { CardDisplayType, DateTimeAbsoluteUnit } from "metabase-types/api";

import type { AggOp, PenaltyId } from "./types";

export const K = {
  K1_SCALAR_MAX_MEASURES: 4,
  K2_PIN_MAX_COLS: 6,
  K3_AREA_STACK_MAX_SERIES: 8,
  K4_LINE_MAX_SERIES: 20,
  K5_PIE_MAX_SLICES: 6,
  K6_BAR_MAX_CATEGORIES: 10,
  K7_ROW_MAX_CATEGORIES: 30,
  K8_STACK_MAX_SERIES: 6,
  K9_STACK_MAX_AXIS: 12,
  K10_PIVOT_MAX_CELLS: 400,
  K11_SCATTER_MAX_COLS: 5,
} as const;

export const CAPS = {
  MAX_SERIES: 100,
  ROW_PROVISIONAL_MAX: 100,
  LINE_PROVISIONAL_MAX: 100,
  ROW_STACK_MAX_SERIES: 20,
  ROW_STACK_MAX_AXIS: 30,
  PIVOT_TABLE_MAX_CARD: 16,
  TREEMAP_MAX_AXIS: 50,
  TREEMAP_MAX_SERIES: 10,
  SANKEY_MAX_NODES: 150,
  PIN_MAX_N: 5000,
  PIN_TILES_MIN_N: 1000,
  SCATTER_MAX_N: 10000,
  RAW_LINE_MAX_N: 5000,
  ORDINAL_NUM_MAX_CARD: 20,
  DNUM_BAR_MAX_CARD: 20,
  UNINFORMATIVE_CATEGORY_MAX_CARD: 100,
  FUNNEL_MIN: 3,
  FUNNEL_MAX: 8,
  BOXPLOT_MAX_CAT: 20,
  DISTINCT_SCAN_CAP: 10_000,
  SAMPLE_ROWS: 1000,
  FINGERPRINT_SAMPLE: 10_000,
  HIGH_CARD_UNKNOWN: 5000,
  TIME_BUCKET_TARGET_MIN: 10,
  TIME_BUCKET_TARGET_MAX: 25,
  DEFAULT_BINS: 20,
  MAX_ENUMERATED_DIMS: 4,
  ALTERNATIVES: 5,
  N_ESTIMATE_CAP: 1_000_000,
} as const;

export const THRESH = {
  LABEL_LONG: 12,
  ATTRIBUTE_AVG_LENGTH: 50,
  ATTRIBUTE_PERCENT: 0.9,
  NEAR_UNIQUE_TOP3: 0.01,
  PIE_TOP_SHARE: 0.9,
  PIE_SLICE_THRESHOLD: 2.5,
  REGION_MATCH_MIN: 0.8,
  SAME_SCALE_RATIO: 100,
  FUNNEL_TAU: -0.8,
  FUNNEL_VIOLATION_FRAC: 0.05,
  CORR_STRONG: 0.7,
  LOG_RATIO: 1e4,
  LOG_SKEW: 3,
  MISSING_BUCKET_FRAC: 0.1,
  NULL_CATEGORY_SHARE: 0.5,
  CONFIDENCE_MIN: 0.5,
  RULE_FACTOR_MBQL: 1.0,
  RULE_FACTOR_NATIVE: 0.6,
  ROTATE_45_MIN_CARD: 12,
  COMPACT_MIN_CARD: 30,
  SHOW_VALUES_MAX_N: 10,
  BAR_ON_TIME_MIN_N: 30,
  SCATTER_COLOR_MAX_CARD: 8,
  EVEN_SPACING_TOLERANCE: 0.05,
  // Calendar buckets are uneven (28-31 day months), so a looser tolerance.
  TIME_STEP_TOLERANCE: 0.2,
} as const;

export const W: Record<PenaltyId, number> = {
  "time-not-on-x": 20,
  "x-cardinality": 1,
  "series-cardinality": 1,
  "long-labels-vertical-bar": 8,
  "pie-baseline": 6,
  "line-unordered-x": 50,
  "bar-on-time-x": 10,
  "measure-dropped": 15,
  "dimension-dropped": 25,
  "table-when-chart": 12,
  "pivot-vs-table-bonus": -5,
  "scatter-aggregated": 10,
  "region-match": 100,
  "combo-many-measures": 20,
  "role-confidence": 30,
  interestingness: -10,
  "cumulative-not-line": 8,
  "share-not-stacked": 5,
  "raw-rows-line": 15,
  "scalar-multi-measure": 3,
  "row-vs-bar-short-labels": 2,
  "alt-only-display": 40,
  "funnel-shape": 1,
  "numeric-x-order": 1,
  "provisional-overflow": 1,
  "mixed-scale-shared-axis": 10,
  "secondary-display": 4,
  "ordered-dim-as-series": 6,
  "geo-dim-on-axis": 30,
  "table-no-mini-bar": 1,
};

// Stays below W["table-when-chart"] up to CAPS.ROW_PROVISIONAL_MAX so a
// categorical chart keeps winning over a table until the axis is unreadable.
export function xCardinalityPenalty(cardinality: number): number {
  if (cardinality <= K.K6_BAR_MAX_CATEGORIES) {
    return 0;
  }
  if (cardinality <= CAPS.ROW_PROVISIONAL_MAX) {
    return 0.1 * (cardinality - K.K6_BAR_MAX_CATEGORIES);
  }
  return 100;
}

// Crosses the pivot baseline (table-when-chart + pivot-vs-table-bonus = 7)
// right after K4 so a line with too many series yields to a pivot table.
export function seriesPenalty(seriesCount: number): number {
  if (seriesCount <= K.K8_STACK_MAX_SERIES) {
    return 0;
  }
  if (seriesCount <= K.K4_LINE_MAX_SERIES) {
    return 0.45 * (seriesCount - K.K8_STACK_MAX_SERIES);
  }
  if (seriesCount <= CAPS.MAX_SERIES) {
    return 8 + 0.2 * (seriesCount - K.K4_LINE_MAX_SERIES);
  }
  return 100;
}

export const BAR_OVER_K6_PENALTY = 4;
export const FUNNEL_UNVERIFIED_PENALTY = 40;
export const FUNNEL_VERIFIED_BONUS = -3;
export const RAW_ROWS_LINE_UNVERIFIED = 0.2;
export const SCALAR_TOO_MANY_MEASURES_PENALTY = 20;
export const SERIES_TIE_BREAK_PER_UNIT = 0.05;
export const SANKEY_NAME_RE = /source|target|from|to$|origin|destination/i;

export const SCALE_FAMILY_PER_ROW_OPS: readonly AggOp[] = [
  "avg",
  "min",
  "max",
  "median",
  "percentile",
  "stddev",
  "var",
];

export const KEY_NAME_RE = /^id$|[_-]id$/i;
export const MEASURE_NAME_RE =
  /count|total|sum|amount|revenue|avg|mean|rate|pct|ratio|qty|num_/i;
export const FUNNEL_NAME_RE = /stage|step|status|funnel|phase/i;

export const MEASURE_SEMANTICS = [
  "type/Currency",
  "type/Income",
  "type/Price",
  "type/Cost",
  "type/Discount",
  "type/GrossMargin",
  "type/Score",
  "type/Share",
  "type/Percentage",
  "type/Quantity",
  "type/Duration",
] as const;

export const ATTRIBUTE_SEMANTICS = [
  "type/URL",
  "type/ImageURL",
  "type/AvatarURL",
  "type/Email",
  "type/Description",
  "type/Comment",
  "type/JSON",
  "type/SerializedJSON",
  "type/XML",
] as const;

export const HIDDEN_VISIBILITY = [
  "details-only",
  "hidden",
  "sensitive",
  "retired",
] as const;

export const ADDITIVE_OPS: readonly AggOp[] = [
  "count",
  "sum",
  "sum-where",
  "count-where",
];

export const CUMULATIVE_OPS: readonly AggOp[] = ["cum-sum", "cum-count"];

export const INTEGER_RESULT_OPS: readonly AggOp[] = [
  "count",
  "cum-count",
  "distinct",
  "count-where",
  "distinct-where",
];

export const FLOAT_RESULT_OPS: readonly AggOp[] = [
  "avg",
  "share",
  "stddev",
  "var",
];

export const DISPLAY_ORDER: readonly CardDisplayType[] = [
  "table",
  "object",
  "scalar",
  "smartscalar",
  "line",
  "area",
  "bar",
  "row",
  "combo",
  "scatter",
  "pie",
  "funnel",
  "map",
  "pivot",
  "sankey",
  "treemap",
  "waterfall",
  "boxplot",
  "gauge",
  "progress",
];

export const ALT_ONLY_DISPLAYS: readonly CardDisplayType[] = [
  "smartscalar",
  "gauge",
  "progress",
  "boxplot",
  "waterfall",
];

export const DAYS_PER_UNIT: Record<DateTimeAbsoluteUnit, number> = {
  minute: 1 / 1440,
  hour: 1 / 24,
  day: 1,
  week: 7,
  month: 30.44,
  quarter: 91.3,
  year: 365.25,
};
