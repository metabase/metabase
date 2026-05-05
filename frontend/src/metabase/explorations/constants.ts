import type { MetricDimension } from "metabase-types/api";

/**
 * Interestingness scores ≥ this value are considered "potentially interesting".
 * Used to decide which dimensions to auto-pick for the user (e.g. when the
 * chat agent emits a metrics+dimensions selection).
 */
export const INTERESTINGNESS_SCORE_THRESHOLD =
  window.Metabase.INTERESTINGNESS_SCORE_THRESHOLD || 0.7;

export function passesInterestingnessThreshold(
  score: number | null | undefined,
): boolean {
  return (score ?? 0) >= INTERESTINGNESS_SCORE_THRESHOLD;
}

export function isInterestingDimension(dimension: MetricDimension): boolean {
  return passesInterestingnessThreshold(dimension.dimension_interestingness);
}
