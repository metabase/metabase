// Every tunable for this variant lives here.
import type { CubeCardKind, DimensionType } from "../types";

// Default settings (initial load)
export const DEFAULT_MEASURE_COUNT = 3;
export const DEFAULT_DIMENSION_COUNT = 5;
export const DEFAULT_DIMENSION_TYPE_CAPS: Record<DimensionType, number> = {
  time: 1,
  geo: 1,
  category: 3,
  boolean: 1,
  numeric: 1,
};
export const DEFAULT_FILTER_DIMENSION_COUNT = 4;
/** Same threshold as explorations.impl/min-interestingness. */
export const MIN_DIMENSION_SCORE = 0.1;

// Candidates
export const LOW_CARDINALITY_MAX = 10;
export const MAX_SEGMENTS = 4;

// Picking
/** Cards picked per generation, excluding overview cards. */
export const BASE_CARD_BUDGET = 10;
export const MAX_CARD_BUDGET = 24;
export const MIN_CARD_SCORE = 0.05;

export type ScoredKind = Exclude<CubeCardKind, "overview" | "custom">;

export const KIND_PRIOR: Record<ScoredKind, number> = {
  single: 1.0,
  "time-by-category": 0.9,
  "by-segment": 0.75,
  "segment-vs-total": 0.7,
  "segmented-single": 0.45,
};

export const TYPE_PRIOR: Record<DimensionType, number> = {
  time: 1.0,
  geo: 0.9,
  category: 0.85,
  boolean: 0.6,
  numeric: 0.5,
};

export const KIND_CAPS: Partial<Record<ScoredKind, number>> = {
  "time-by-category": 2,
  "by-segment": 1,
  "segment-vs-total": 2,
  "segmented-single": 2,
};

/** Picked first, one each, when a candidate exists ("when possible"). */
export const FEATURED_KINDS: ScoredKind[] = [
  "time-by-category",
  "by-segment",
  "segment-vs-total",
];

export const MEASURE_DECAY = 0.85;
export const SEGMENT_DECAY = 0.8;
export const MEASURE_REPEAT_PENALTY = 0.8;
export const DIMENSION_REPEAT_PENALTY = 0.7;

/** Fill pass only: max cards sharing the same first (x-axis) dimension. */
export const MAX_CARDS_PER_DIMENSION = 2;

export const LAYOUT_KIND_ORDER: CubeCardKind[] = [
  "overview",
  "by-segment",
  "single",
  "time-by-category",
  "segment-vs-total",
  "segmented-single",
];

export const LAYOUT_TYPE_ORDER: DimensionType[] = [
  "time",
  "geo",
  "category",
  "boolean",
  "numeric",
];
